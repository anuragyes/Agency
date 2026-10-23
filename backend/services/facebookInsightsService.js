// ─────────────────────────────────────────────────────────────
// facebookInsightsService.js — REAL Facebook Page numbers (official Graph API)
//   getFacebookPageOverview()      your Page: followers, likes, recent posts with reactions / comments / shares
//   getFacebookCompetitorPage(id)  another Page (username, id or facebook.com link): profile + recent posts.
//                                  Meta only allows this for apps approved for "Page Public Content Access"
//                                  (or Pages you manage) — otherwise you get a clear 403 message.
// Posts come back in the SAME shape as Instagram (instagramInsightsService.toPostView), so the
// stats, the Accounts page and competitor research work for both platforms.
//   likes = reactions (like, love, haha …) · engagement = reactions + comments + shares
// ─────────────────────────────────────────────────────────────
const { extractHashtags } = require("./instagramService.js");
const { computeStats } = require("./instagramInsightsService.js");
const { getPageAccess, fbGetWithFallback, absoluteFbUrl } = require("./facebookService.js");

const num = (v) => (Number.isFinite(v) ? v : null);

const PAGE_FIELDS = [
    "id,name,username,link,about,category,fan_count,followers_count,picture.type(large){url},website",
    "id,name,username,link,about,category,fan_count,followers_count,picture{url}",
    "id,name,link,fan_count",
    "id,name",
];
const POST_FIELDS = [
    "id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,type,url},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
    "id,message,created_time,permalink_url,full_picture,status_type,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
    "id,message,created_time,permalink_url,full_picture,shares",
    "id,message,created_time,permalink_url",
];

/** Facebook post -> Instagram-like media type (used by competitorAnalysis.formatOf) */
const mediaTypeOf = (p) => {
    const a = p.attachments?.data?.[0] || {};
    const t = String(a.media_type || a.type || "").toLowerCase();
    const link = `${p.permalink_url || ""} ${a.url || ""}`;
    if (/\/reel\//.test(link)) return { mediaType: "VIDEO", productType: "REELS" };
    if (t === "album") return { mediaType: "CAROUSEL_ALBUM", productType: "FEED" };
    if (t.includes("video")) return { mediaType: "VIDEO", productType: "FEED" };
    if (t === "photo" || t.includes("photo") || p.full_picture) return { mediaType: "IMAGE", productType: "FEED" };
    return { mediaType: "TEXT", productType: "FEED" };
};

/** One Facebook post in the shape the frontend + analysis use */
const toFacebookPostView = (p, pageName) => {
    const reactions = num(p.reactions?.summary?.total_count);
    const comments = num(p.comments?.summary?.total_count);
    // Meta leaves "shares" out when a post has 0 shares
    const shares = num(p.shares?.count) ?? (reactions != null || comments != null ? 0 : null);
    const known = [reactions, comments, shares].filter((v) => v != null);
    return {
        id: p.id,
        caption: p.message || "",
        hashtags: extractHashtags(p.message).map((t) => `#${t}`),
        likes: reactions,
        comments,
        shares,
        engagement: known.length ? known.reduce((a, b) => a + b, 0) : null,
        ...mediaTypeOf(p),
        permalink: absoluteFbUrl(p.permalink_url) || "",
        timestamp: p.created_time || null,
        imageUrl: p.full_picture || null,
        ...(pageName && { username: pageName }),
    };
};

const toProfile = (page, fallbackId) => ({
    id: page.id || fallbackId,
    username: String(page.username || page.id || fallbackId).toLowerCase(),
    name: page.name || "",
    category: page.category || "",
    biography: page.about || "",
    website: page.website || "",
    link: page.link || (page.username ? `https://www.facebook.com/${page.username}` : `https://www.facebook.com/${page.id || fallbackId}`),
    profilePictureUrl: page.picture?.data?.url || null,
    followers: num(page.followers_count) ?? num(page.fan_count),
    pageLikes: num(page.fan_count),
    following: null,
    mediaCount: null,
});

const { getAccountCredentials } = require("./tokenService.js");

const readPosts = async (pageRef, limit, pageName, opts = {}) => {
    const data = await fbGetWithFallback(`${pageRef}/posts`, { limit: Math.min(100, Math.max(1, limit)) }, POST_FIELDS, "posts", opts);
    return (data.data || []).map((p) => toFacebookPostView(p, pageName));
};

const shareStats = (posts) => {
    const withShares = posts.filter((p) => p.shares != null);
    return { avgShares: withShares.length ? Math.round(withShares.reduce((a, p) => a + p.shares, 0) / withShares.length) : null };
};

// ───────── Your own Page ─────────
const getFacebookPageOverview = async ({ postLimit = 25, productId, userId, customToken, customPageId } = {}) => {
    let opts = {};
    if (customToken || customPageId) {
        opts = { customToken, customPageId };
    } else {
        const creds = await getAccountCredentials({ productId, userId, platform: "facebook" });
        if (creds?.accessToken) {
            opts = { customToken: creds.accessToken, customPageId: creds.accountId };
        }
    }

    if (!opts.customToken && userId) {
        throw Object.assign(new Error("No Facebook Page connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });
    }

    const { pageId } = await getPageAccess(opts);
    const page = await fbGetWithFallback(pageId, {}, PAGE_FIELDS, "Page lookup", opts);
    const profile = toProfile(page, pageId);

    let posts = [];
    let postsError = null;
    try {
        posts = await readPosts(pageId, postLimit, profile.name, opts);
    } catch (err) {
        postsError = err.message;
        console.error("[FacebookPage] posts error:", postsError);
    }

    return {
        profile,
        stats: { ...computeStats(posts, profile.followers), ...shareStats(posts) },
        recentPosts: posts,
        ...(postsError && { errors: { media: postsError } }),
        source: "Facebook Graph API",
        fetchedAt: new Date().toISOString(),
    };
};

/** "nike", "@nike", "https://www.facebook.com/nike/", "facebook.com/profile.php?id=123" -> "nike" / "123" */
const cleanPageRef = (raw) => {
    let s = String(raw || "").trim();
    const idParam = s.match(/[?&]id=(\d+)/);
    if (idParam) return idParam[1];
    s = s.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.|web\.)?(facebook|fb)\.com\//i, "").replace(/^@/, "");
    s = s.split(/[/?#]/)[0];
    return s;
};

const NO_ACCESS = "Facebook only shares other Pages' posts with apps approved for \"Page Public Content Access\" (Meta app review). Pages you manage work right away.";

// ───────── Another Page (competitor) ─────────
const getFacebookCompetitorPage = async (raw, { postLimit = 30 } = {}) => {
    const ref = cleanPageRef(raw);
    if (!/^[A-Za-z0-9.\-_]{2,100}$/.test(ref)) {
        throw Object.assign(new Error("Enter a Facebook Page username, Page id or facebook.com link"), { statusCode: 400 });
    }
    let page;
    try {
        page = await fbGetWithFallback(ref, {}, PAGE_FIELDS, "Page lookup");
    } catch (err) {
        if (err.fbSubcode === 33 || err.fbCode === 803) {
            throw Object.assign(new Error(`Facebook Page "${ref}" was not found, or your app can't read it. ${NO_ACCESS}`), { statusCode: 404 });
        }
        if ([10, 200].includes(err.fbCode)) throw Object.assign(new Error(NO_ACCESS), { statusCode: 403 });
        throw err;
    }
    const profile = toProfile(page, ref);
    let posts;
    try {
        posts = await readPosts(page.id || ref, postLimit, profile.name);
    } catch (err) {
        if ([10, 200].includes(err.fbCode) || err.fbSubcode === 33) {
            throw Object.assign(new Error(`${profile.name || ref}: ${NO_ACCESS}`), { statusCode: 403 });
        }
        throw err;
    }
    return {
        profile,
        stats: { ...computeStats(posts, profile.followers), ...shareStats(posts) },
        recentPosts: posts,
        source: "Facebook Graph API",
        fetchedAt: new Date().toISOString(),
    };
};

module.exports = { getFacebookPageOverview, getFacebookCompetitorPage, toFacebookPostView, cleanPageRef, NO_ACCESS };
