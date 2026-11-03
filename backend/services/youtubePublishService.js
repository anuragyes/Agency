// ─────────────────────────────────────────────────────────────
// youtubePublishService.js — YouTube Video & Thumbnail Publishing Service
// Uses official Google YouTube Data API v3.
// Handles video uploads (Shorts & Standard), custom thumbnail attachment,
// metadata formatting, and status tracking.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getAccountCredentials } = require("./tokenService.js");

const YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Refresh expired Google OAuth 2.0 access token using offline refreshToken
 */
const refreshGoogleAccessToken = async (refreshToken) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !refreshToken) return null;

    try {
        const bodyParams = {
            client_id: clientId,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        };
        if (clientSecret) bodyParams.client_secret = clientSecret;

        const res = await axios.post(
            "https://oauth2.googleapis.com/token",
            new URLSearchParams(bodyParams).toString(),
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 10000,
            }
        );
        return res.data; // { access_token, expires_in, scope, token_type }
    } catch (err) {
        console.warn("[YouTube] Token refresh request failed:", err.response?.data || err.message);
        return null;
    }
};

/**
 * Format clean YouTube description with intro, chapters, and hashtags
 */
const buildYouTubeDescription = (content = {}) => {
    const parts = [];

    if (content.description) {
        parts.push(content.description.trim());
    }

    // Append Chapters if available
    if (Array.isArray(content.chapters) && content.chapters.length > 0) {
        parts.push("\n⏱️ CHAPTERS:");
        content.chapters.forEach((ch) => {
            if (ch.time && ch.title) {
                parts.push(`${ch.time} - ${ch.title}`);
            }
        });
    }

    // Append Tags / Hashtags
    if (Array.isArray(content.tags) && content.tags.length > 0) {
        const hashTags = content.tags
            .slice(0, 5)
            .map((t) => (t.startsWith("#") ? t : `#${t.replace(/\s+/g, "")}`))
            .join(" ");
        parts.push(`\n${hashTags}`);
    }

    return parts.join("\n\n").trim();
};

/**
 * Upload thumbnail image to a published YouTube video
 */
const setCustomThumbnail = async (videoId, thumbnailUrl, accessToken) => {
    try {
        if (!thumbnailUrl || !videoId || !accessToken) return { ok: false, reason: "Missing params" };

        let imageBuffer = null;
        let mimeType = "image/jpeg";

        // 1. First priority: Check local filesystem directly (avoids network/localhost resolution delays)
        try {
            const parsed = new URL(thumbnailUrl, "http://localhost:5000");
            const filename = path.basename(parsed.pathname);
            const localUploadPath = path.join(__dirname, "..", "uploads", "youtube", filename);
            if (fs.existsSync(localUploadPath)) {
                imageBuffer = fs.readFileSync(localUploadPath);
                mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
                console.log(`[YouTube] Read thumbnail directly from local disk: ${filename} (${imageBuffer.length} bytes)`);
            }
        } catch {}

        // 2. Direct absolute or relative file path
        if (!imageBuffer && fs.existsSync(thumbnailUrl)) {
            imageBuffer = fs.readFileSync(thumbnailUrl);
            mimeType = thumbnailUrl.endsWith(".png") ? "image/png" : "image/jpeg";
        }

        // 3. Remote HTTP URL fetch fallback
        if (!imageBuffer && thumbnailUrl.startsWith("http")) {
            const resp = await axios.get(thumbnailUrl, { responseType: "arraybuffer", timeout: 15000 });
            imageBuffer = Buffer.from(resp.data);
            mimeType = resp.headers["content-type"] || "image/jpeg";
        }

        if (!imageBuffer) {
            console.warn(`[YouTube] Could not load thumbnail file buffer for: ${thumbnailUrl}`);
            return { ok: false, reason: "Could not load thumbnail file" };
        }

        const res = await axios.post(
            `${YOUTUBE_UPLOAD_BASE}/thumbnails/set`,
            imageBuffer,
            {
                params: { videoId, uploadType: "media" },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": mimeType,
                    "Content-Length": imageBuffer.length,
                },
                timeout: 30000,
            }
        );

        console.log(`[YouTube] Successfully set custom thumbnail for video ${videoId}:`, res.data?.items?.[0]?.default?.url || "OK");
        return { ok: true, data: res.data };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.warn(`[YouTube] Custom thumbnail notice for video ${videoId}:`, msg);
        return { ok: false, error: msg };
    }
};

/**
 * Publish a video to YouTube with title, description, tags, and AI thumbnail.
 */
const publishToYouTube = async (postDoc, { customToken } = {}) => {
    try {
        const creds = await getAccountCredentials({
            productId: postDoc.productId,
            userId: postDoc.userId,
            platform: "youtube",
        });

        let token = customToken;
        if (!token && creds?.accessToken && !creds.accessToken.startsWith("AIza") && creds.accessToken !== "API_KEY") {
            token = creds.accessToken;
        }
        if (!token) {
            token = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || process.env.YOUTUBE_ACCESS_TOKEN;
        }

        // Auto-refresh expired OAuth token if refreshToken exists
        if (creds?.refreshToken) {
            const isNearExpiry = creds.tokenExpiresAt && new Date(creds.tokenExpiresAt).getTime() - Date.now() < 60000;
            if (!token || isNearExpiry) {
                const refreshed = await refreshGoogleAccessToken(creds.refreshToken);
                if (refreshed?.access_token) {
                    token = refreshed.access_token;
                    try {
                        const SocialAccount = require("../models/SocialAccount.js");
                        await SocialAccount.updateOne(
                            { userId: postDoc.userId, platform: "youtube" },
                            {
                                $set: {
                                    accessToken: token,
                                    tokenExpiresAt: refreshed.expires_in
                                        ? new Date(Date.now() + refreshed.expires_in * 1000)
                                        : null,
                                },
                            }
                        );
                        console.log("[YouTube] Refreshed OAuth token successfully.");
                    } catch (dbErr) {
                        console.warn("[YouTube] Could not save refreshed token to DB:", dbErr.message);
                    }
                }
            }
        }

        if (!token || token.startsWith("AIza") || token === "API_KEY") {
            throw new Error(
                "YouTube video publishing requires an authorized Google OAuth 2.0 channel connection. " +
                "Please connect your YouTube channel via Google OAuth in Accounts page (or configure YOUTUBE_OAUTH_ACCESS_TOKEN in backend/.env)."
            );
        }

        const videoUrl = postDoc.video?.url;
        if (!videoUrl) {
            throw new Error("No video file attached to this post. Please upload an MP4 or MOV video file first.");
        }

        const content = postDoc.content || {};
        const title = (content.title || "New YouTube Video").slice(0, 100);
        const description = buildYouTubeDescription(content);
        const tags = Array.isArray(content.tags) ? content.tags : [];
        const categoryId = content.categoryId || "22"; // 22 = People & Blogs
        const privacyStatus = content.privacyStatus || "public";
        const madeForKids = Boolean(content.madeForKids);

        // Fetch or read the video stream / buffer
        let videoStream = null;
        let contentLength = null;

        if (videoUrl.startsWith("http")) {
            const headRes = await axios.head(videoUrl, { timeout: 10000 });
            contentLength = headRes.headers["content-length"];
            const streamRes = await axios.get(videoUrl, { responseType: "stream", timeout: 60000 });
            videoStream = streamRes.data;
        } else {
            const resolvedPath = path.isAbsolute(videoUrl) ? videoUrl : path.join(__dirname, "..", videoUrl);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Video file not found on server: ${resolvedPath}`);
            }
            const stats = fs.statSync(resolvedPath);
            contentLength = stats.size;
            videoStream = fs.createReadStream(resolvedPath);
        }

        // 1. Initialize Resumable Upload Session
        const metadata = {
            snippet: {
                title: postDoc.contentType === "short" && !title.toLowerCase().includes("#shorts")
                    ? `${title} #Shorts`
                    : title,
                description,
                tags,
                categoryId,
            },
            status: {
                privacyStatus: postDoc.scheduledAt ? "private" : privacyStatus,
                selfDeclaredMadeForKids: madeForKids,
                ...(postDoc.scheduledAt && { publishAt: postDoc.scheduledAt.toISOString() }),
            },
        };

        const sessionRes = await axios.post(
            `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
            metadata,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Type": postDoc.video?.mimeType || "video/mp4",
                    ...(contentLength && { "X-Upload-Content-Length": contentLength }),
                },
                timeout: 20000,
            }
        );

        const uploadUrl = sessionRes.headers["location"];
        if (!uploadUrl) {
            throw new Error("YouTube failed to return a resumable upload location URL");
        }

        // 2. Stream video content into the upload session
        const uploadRes = await axios.put(uploadUrl, videoStream, {
            headers: {
                "Content-Type": postDoc.video?.mimeType || "video/mp4",
                ...(contentLength && { "Content-Length": contentLength }),
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000, // 5 min timeout for video upload
        });

        const videoId = uploadRes.data?.id;
        if (!videoId) {
            throw new Error("YouTube upload succeeded but no videoId was returned");
        }

        const isShort = postDoc.contentType === "short";
        const permalink = isShort
            ? `https://www.youtube.com/shorts/${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`;

        console.log(`[YouTube] Successfully published video: ${permalink}`);

        // 3. Attach AI Thumbnail if available
        let thumbResult = null;
        if (postDoc.thumbnail?.url) {
            // Allow 2.5 seconds for YouTube ingestion pipeline to register the newly created videoId
            await new Promise((r) => setTimeout(r, 2500));
            thumbResult = await setCustomThumbnail(videoId, postDoc.thumbnail.url, token);
        }

        return {
            ok: true,
            videoId,
            videoUrl: permalink,
            permalink,
            rawResponse: uploadRes.data,
            thumbnailAttached: Boolean(thumbResult?.ok),
            thumbnailDetails: thumbResult,
        };
    } catch (err) {
        let msg = err.response?.data?.error?.message || err.message || "Failed to publish video to YouTube";
        if (err.response?.status === 401 || msg.includes("invalid authentication credentials")) {
            msg = "YouTube authentication failed (OAuth 2.0 access token is invalid or expired). Please connect your YouTube channel via Google OAuth in Accounts page.";
        }
        console.error("[YouTube Publish Error]:", msg);
        return { ok: false, error: msg };
    }
};

module.exports = {
    publishToYouTube,
    setCustomThumbnail,
    buildYouTubeDescription,
};

