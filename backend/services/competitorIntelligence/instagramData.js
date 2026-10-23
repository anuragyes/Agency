// ─────────────────────────────────────────────────────────────
// instagramData.js — extra REAL Instagram Graph API reads for the intelligence agents
//   getOwnComments(posts)       comment text on YOUR posts      GET /{media-id}/comments
//   getOwnMediaResults(mediaId) likes/comments + insights       GET /{media-id} , /{media-id}/insights
// Uses the Instagram Login token (INSTAGRAM_ACCESS_TOKEN, graph.instagram.com) like getInstagramAccountOverview.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { apiErrorMessage } = require("../instagramService.js");
const { getAccountCredentials } = require("../tokenService.js");

const TIMEOUT = 15000;
const creds = async (productId) => {
    const c = await getAccountCredentials({ productId, platform: "instagram" });
    const token = c?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const version = process.env.INSTAGRAM_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
    const isMeta = (token || "").startsWith("EA") || !(token || "").startsWith("IG");
    const host = isMeta ? "https://graph.facebook.com" : "https://graph.instagram.com";
    return { token, version, base: `${host}/${version}` };
};

/** comments on your newest posts that have comments -> [{ mediaId, text, timestamp, likeCount, username }] */
const getOwnComments = async (posts = [], { maxPosts = 15, perPost = 50, onPost, productId } = {}) => {
    const { token, base } = await creds(productId);
    if (!token) return { comments: [], note: "No Instagram account connected. Please connect via Meta OAuth in Social Accounts." };
    const targets = posts.filter((p) => p.id && (p.comments || 0) > 0).slice(0, maxPosts);
    const comments = [];
    let firstError = null;
    for (const p of targets) {
        try {
            const { data } = await axios.get(`${base}/${p.id}/comments`, {
                params: { access_token: token, fields: "id,text,timestamp,like_count,username", limit: perPost }, timeout: TIMEOUT,
            });
            (data.data || []).forEach((c) => comments.push({ mediaId: p.id, text: c.text || "", timestamp: c.timestamp, likeCount: c.like_count ?? null, username: c.username || null }));
        } catch (err) {
            firstError = firstError || apiErrorMessage(err);
            if ([10, 190, 200].includes(err.response?.data?.error?.code)) break; // permission / token problem: stop early
        }
        onPost?.(comments.length);
    }
    return {
        comments,
        postsRead: targets.length,
        note: !comments.length && firstError ? `Your comments could not be read (${firstError}). Needs the instagram_business_manage_comments permission.` : !targets.length ? "Your recent posts have no comments yet." : null,
    };
};

/** results of one of YOUR published posts (real numbers) */
const getOwnMediaResults = async (mediaId, metrics = ["reach", "saved", "shares", "views", "total_interactions"], { productId } = {}) => {
    const { token, base } = await creds(productId);
    if (!token) throw Object.assign(new Error("No Instagram account connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });
    const { data: m } = await axios.get(`${base}/${mediaId}`, {
        params: { access_token: token, fields: "id,like_count,comments_count,timestamp,permalink,media_type,media_product_type" }, timeout: TIMEOUT,
    });
    const insights = {};
    // ask metric by metric: one unsupported metric (e.g. views on old photos) must not hide the others
    await Promise.all(metrics.map(async (metric) => {
        try {
            const { data } = await axios.get(`${base}/${mediaId}/insights`, { params: { access_token: token, metric }, timeout: TIMEOUT });
            const v = data.data?.[0]?.values?.[0]?.value ?? data.data?.[0]?.total_value?.value;
            if (Number.isFinite(v)) insights[metric] = v;
        } catch { /* metric not available for this media type */ }
    }));
    return {
        mediaId, permalink: m.permalink, timestamp: m.timestamp, mediaType: m.media_type, productType: m.media_product_type,
        likes: m.like_count ?? null, comments: m.comments_count ?? null, insights,
    };
};

module.exports = { getOwnComments, getOwnMediaResults };
