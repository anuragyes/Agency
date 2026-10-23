// ─────────────────────────────────────────────────────────────
// authController.js — Multi-tenant OAuth Controller
// Manages OAuth authorization, callbacks, token exchange, and account storage.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const mongoose = require("mongoose");
const SocialAccount = require("../models/SocialAccount.js");
const { extendMetaToken } = require("../services/tokenService.js");

const FB_GRAPH = "https://graph.facebook.com";

const getBackendUrl = () => (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
const getFrontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

/**
 * GET /api/auth/meta/connect
 * Generates and redirects to Meta's OAuth dialog.
 */
const connectMeta = (req, res) => {
    const appId = process.env.META_APP_ID;
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";
    const productId = req.query.productId || "";
    const userId = req.user?._id?.toString() || "";

    if (!appId) {
        return res.status(500).json({ success: false, message: "META_APP_ID is missing in .env" });
    }

    const redirectUri = `${getBackendUrl()}/api/auth/meta/callback`;
    const scopes = [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_insights",
        "instagram_manage_comments",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
    ].join(",");

    // Encode both productId and userId into state (base64url)
    const state = Buffer.from(JSON.stringify({ productId, userId })).toString("base64url");

    const authUrl = `https://www.facebook.com/${version}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&scope=${scopes}&response_type=code&state=${encodeURIComponent(state)}&auth_type=rerequest`;

    // If request asks for JSON, return URL, otherwise redirect browser directly
    if (req.headers.accept?.includes("application/json")) {
        return res.json({ success: true, authUrl });
    }
    return res.redirect(authUrl);
};

/**
 * GET /api/auth/meta/callback
 * Meta redirects here with ?code=...&state=productId
 */
const handleMetaCallback = async (req, res) => {
    const { code, state: rawState, error, error_description } = req.query;
    const frontendUrl = getFrontendUrl();

    if (error || !code) {
        const msg = error_description || error || "User cancelled authorization";
        console.warn("[OAuth] Meta callback cancelled/error:", msg);
        return res.redirect(`${frontendUrl}/app/accounts?error=${encodeURIComponent(msg)}`);
    }

    let targetProductId = undefined;
    let targetUserId = undefined;

    if (rawState) {
        try {
            const decoded = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
            if (decoded.productId && mongoose.isValidObjectId(decoded.productId)) {
                targetProductId = decoded.productId;
            }
            if (decoded.userId && mongoose.isValidObjectId(decoded.userId)) {
                targetUserId = decoded.userId;
            }
        } catch {
            try {
                const decoded = JSON.parse(Buffer.from(rawState, "base64").toString("utf8"));
                if (decoded.productId && mongoose.isValidObjectId(decoded.productId)) targetProductId = decoded.productId;
                if (decoded.userId && mongoose.isValidObjectId(decoded.userId)) targetUserId = decoded.userId;
            } catch {
                if (mongoose.isValidObjectId(rawState)) targetProductId = rawState;
            }
        }
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";
    const redirectUri = `${getBackendUrl()}/api/auth/meta/callback`;

    try {
        // 1. Exchange temporary code for short-lived user access token
        const tokenRes = await axios.get(`${FB_GRAPH}/${version}/oauth/access_token`, {
            params: {
                client_id: appId,
                client_secret: appSecret,
                redirect_uri: redirectUri,
                code,
            },
            timeout: 15000,
        });

        const shortLivedToken = tokenRes.data.access_token;

        // 2. Exchange for 60-day Long-Lived Token
        const { accessToken: longLivedToken, expiresInSec } = await extendMetaToken(shortLivedToken);
        const tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000);

        // 3. Query user's Facebook Pages and linked Instagram Business Accounts
        const pagesRes = await axios.get(`${FB_GRAPH}/${version}/me/accounts`, {
            params: {
                access_token: longLivedToken,
                fields: "id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url}",
            },
            timeout: 15000,
        });

        let pages = pagesRes.data.data || [];

        // Resilient fallback: If /me/accounts returns empty (common with Meta Business Suite & New Pages Experience)
        if (!pages.length) {
            console.log("[OAuth] /me/accounts returned empty. Attempting direct lookup fallback...");
            const fallbackPageId = process.env.META_PAGE_ID || process.env.FACEBOOK_PAGE_ID || process.env.INSTAGRAM_PAGE_ID;
            if (fallbackPageId) {
                try {
                    const singlePageRes = await axios.get(`${FB_GRAPH}/${version}/${fallbackPageId}`, {
                        params: {
                            access_token: longLivedToken,
                            fields: "id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url}",
                        },
                        timeout: 10000,
                    });
                    if (singlePageRes.data?.id) {
                        pages.push(singlePageRes.data);
                        console.log(`[OAuth] Successfully discovered fallback Page: ${singlePageRes.data.name} (${singlePageRes.data.id})`);
                    }
                } catch (pageErr) {
                    console.warn("[OAuth] Fallback page lookup failed:", pageErr.response?.data?.error?.message || pageErr.message);
                }
            }

            // Fallback for standalone Instagram Business account
            if (!pages.length) {
                const fallbackIgId = process.env.META_INSTAGRAM_USER_ID || process.env.INSTAGRAM_USER_ID;
                if (fallbackIgId) {
                    try {
                        const singleIgRes = await axios.get(`${FB_GRAPH}/${version}/${fallbackIgId}`, {
                            params: {
                                access_token: longLivedToken,
                                fields: "id,username,name,profile_picture_url",
                            },
                            timeout: 10000,
                        });
                        if (singleIgRes.data?.id) {
                            pages.push({
                                id: "standalone",
                                name: singleIgRes.data.name || singleIgRes.data.username,
                                access_token: longLivedToken,
                                instagram_business_account: singleIgRes.data,
                            });
                            console.log(`[OAuth] Discovered standalone Instagram account: @${singleIgRes.data.username} (${singleIgRes.data.id})`);
                        }
                    } catch (igErr) {
                        console.warn("[OAuth] Fallback Instagram lookup failed:", igErr.response?.data?.error?.message || igErr.message);
                    }
                }
            }
        }

        if (!pages.length) {
            console.warn("[OAuth] No Facebook Pages found for this user account.");
            return res.redirect(`${frontendUrl}/app/accounts?error=no_facebook_pages_found`);
        }

        let connectedCount = 0;

        // 4. Save connected Pages and Instagram accounts into MongoDB
        for (const page of pages) {
            // A. Save Facebook Page Account (if not standalone)
            if (page.id && page.id !== "standalone") {
                const matchQuery = {
                    platform: "facebook",
                    accountId: page.id,
                };
                if (targetUserId) matchQuery.userId = targetUserId;

                await SocialAccount.findOneAndUpdate(
                    matchQuery,
                    {
                        ...(targetUserId && { userId: targetUserId }),
                        ...(targetProductId && { productId: targetProductId }),
                        platform: "facebook",
                        accountId: page.id,
                        name: page.name,
                        username: page.name,
                        accessToken: page.access_token || longLivedToken,
                        tokenExpiresAt,
                        metadata: { category: page.category },
                        status: "connected",
                    },
                    { upsert: true, new: true }
                );
                connectedCount++;
            }

            // B. If Page has a linked Instagram Business Account, save it too
            const ig = page.instagram_business_account;
            if (ig && ig.id) {
                const matchQuery = {
                    platform: "instagram",
                    accountId: ig.id,
                };
                if (targetUserId) matchQuery.userId = targetUserId;

                await SocialAccount.findOneAndUpdate(
                    matchQuery,
                    {
                        ...(targetUserId && { userId: targetUserId }),
                        ...(targetProductId && { productId: targetProductId }),
                        platform: "instagram",
                        accountId: ig.id,
                        username: ig.username || "",
                        name: ig.name || ig.username || "",
                        profilePictureUrl: ig.profile_picture_url || null,
                        accessToken: page.access_token || longLivedToken,
                        tokenExpiresAt,
                        ...(page.id !== "standalone" && {
                            parentAccountId: page.id,
                            parentAccountName: page.name,
                        }),
                        status: "connected",
                    },
                    { upsert: true, new: true }
                );
                connectedCount++;
            }
        }

        console.log(`[OAuth] Successfully connected ${connectedCount} social channels for user ${targetUserId || "unassigned"}, project ${targetProductId || "default"}.`);
        return res.redirect(`${frontendUrl}/app/accounts?connected=meta&count=${connectedCount}&status=success`);
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message || "Failed to complete Meta OAuth flow";
        console.error("[OAuth] Callback error:", errorMsg);
        return res.redirect(`${frontendUrl}/app/accounts?error=${encodeURIComponent(errorMsg)}`);
    }
};

/**
 * GET /api/auth/accounts?productId=...
 * Lists all connected accounts for the authenticated user.
 */
const listConnectedAccounts = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const { productId } = req.query;

        // Privacy protection: unauthenticated requests never see any connected accounts!
        if (!userId) {
            return res.json({ success: true, data: [] });
        }

        const filter = {
            userId,
            status: "connected",
        };

        if (productId && mongoose.isValidObjectId(productId)) {
            filter.productId = productId;
        }

        const accounts = await SocialAccount.find(filter)
            .select("-accessToken -refreshToken")
            .sort({ updatedAt: -1 })
            .lean();

        return res.json({ success: true, data: accounts });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/auth/accounts/:id
 * Disconnects / revokes an account.
 */
const disconnectAccount = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid account ID" });
        }

        const filter = { _id: id };
        if (userId) filter.userId = userId;

        const updated = await SocialAccount.findOneAndUpdate(filter, { status: "revoked" }, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: "Account not found or access denied" });
        return res.json({ success: true, message: "Account disconnected successfully" });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    connectMeta,
    handleMetaCallback,
    listConnectedAccounts,
    disconnectAccount,
};
