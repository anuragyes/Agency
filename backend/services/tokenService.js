// ─────────────────────────────────────────────────────────────
// tokenService.js — Dynamic Multi-Tenant Token & Credentials Resolver
// Reads OAuth credentials from MongoDB (per product / user),
// with backward-compatible fallback to .env for local development.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const mongoose = require("mongoose");
const SocialAccount = require("../models/SocialAccount.js");

const FB_GRAPH = "https://graph.facebook.com";

/**
 * Get active credentials for a platform and product.
 * Checks MongoDB first; falls back to .env if not found.
 */
const getAccountCredentials = async ({ productId, userId, platform = "instagram" } = {}) => {
    try {
        let acc = null;
        const resolvedUserId = userId && mongoose.isValidObjectId(userId) ? userId : null;

        // If productId is provided without userId, lookup product's owning user
        let productUserId = null;
        if (!resolvedUserId && productId && mongoose.isValidObjectId(productId)) {
            try {
                const Product = require("../models/Product.js");
                const prod = await Product.findById(productId).select("userId").lean();
                if (prod?.userId) {
                    productUserId = prod.userId;
                }
            } catch {
                // Ignore lookup errors
            }
        }

        const targetUserId = resolvedUserId || productUserId;

        if (targetUserId) {
            // First check if an account is linked to this specific product & user
            if (productId && mongoose.isValidObjectId(productId)) {
                acc = await SocialAccount.findOne({
                    userId: targetUserId,
                    productId,
                    platform,
                    status: "connected",
                }).sort({ updatedAt: -1 }).lean();
            }

            // If not linked to this specific product, look for ANY connected account belonging to THIS user
            if (!acc) {
                acc = await SocialAccount.findOne({
                    userId: targetUserId,
                    platform,
                    status: "connected",
                }).sort({ updatedAt: -1 }).lean();
            }
        } else if (productId && mongoose.isValidObjectId(productId)) {
            // If no user context at all, only match an account specifically associated with this productId
            acc = await SocialAccount.findOne({
                productId,
                platform,
                status: "connected",
            }).sort({ updatedAt: -1 }).lean();
        }

        if (acc && acc.accessToken) {
            return {
                source: "database",
                platform,
                accessToken: acc.accessToken,
                accountId: acc.accountId,
                username: acc.username,
                name: acc.name,
                parentAccountId: acc.parentAccountId,
                tokenExpiresAt: acc.tokenExpiresAt,
            };
        }
    } catch (err) {
        console.warn("[tokenService] Error querying SocialAccount:", err.message);
    }

    // Fallback to .env ONLY when no target user was specified (for single-tenant local dev).
    // An authenticated user who hasn't connected accounts must NEVER receive another user's or .env tokens.
    if (!userId) {
        if (platform === "instagram" && (process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN)) {
            return {
                source: "env",
                platform: "instagram",
                accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
                accountId: process.env.META_INSTAGRAM_USER_ID || process.env.INSTAGRAM_USER_ID,
                parentAccountId: process.env.META_PAGE_ID || process.env.INSTAGRAM_PAGE_ID,
            };
        }

        if (platform === "facebook" && process.env.META_ACCESS_TOKEN) {
            return {
                source: "env",
                platform: "facebook",
                accessToken: process.env.META_ACCESS_TOKEN,
                accountId: process.env.META_PAGE_ID,
            };
        }
    }

    return null;
};

/**
 * Exchange a short-lived token or refresh a long-lived Meta token (extends for 60 days).
 */
const extendMetaToken = async (accessToken) => {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";

    if (!appId || !appSecret) {
        throw new Error("META_APP_ID and META_APP_SECRET must be set in .env");
    }

    const res = await axios.get(`${FB_GRAPH}/${version}/oauth/access_token`, {
        params: {
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: accessToken,
        },
        timeout: 10000,
    });

    return {
        accessToken: res.data.access_token,
        tokenType: res.data.token_type,
        expiresInSec: res.data.expires_in || 5184000, // ~60 days default
    };
};

module.exports = {
    getAccountCredentials,
    extendMetaToken,
};
