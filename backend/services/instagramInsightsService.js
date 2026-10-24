// ─────────────────────────────────────────────────────────────
// instagramInsightsService.js — REAL Instagram numbers for the frontend
//   getInstagramAccountOverview()   your account: followers, posts, engagement rate, best hashtags
//                                   (Instagram Login token "IGAA..." on graph.instagram.com)
//   getCompetitorAccount(username)  any Business/Creator account ("top company"): followers,
//                                   recent posts with likes/comments and the hashtags they use
//                                   (Business Discovery API, Facebook token "EAA..." on graph.facebook.com)
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { extractHashtags, apiErrorMessage } = require("./instagramService.js");
const { getAccountCredentials } = require("./tokenService.js");

const IG_GRAPH = "https://graph.instagram.com";
const FB_GRAPH = "https://graph.facebook.com";
const TIMEOUT = 15000;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v) => (Number.isFinite(v) ? v : null);

/** One post in the shape the frontend uses */
const toPostView = (m) => {
    const likes = num(m.like_count);
    const comments = num(m.comments_count);
    return {
        id: m.id,
        caption: m.caption || "",
        hashtags: extractHashtags(m.caption).map((t) => `#${t}`),
        likes,
        comments,
        engagement: likes == null && comments == null ? null : (likes || 0) + (comments || 0),
        mediaType: m.media_type || "",
        productType: m.media_product_type || "",
        permalink: m.permalink || "",
        timestamp: m.timestamp || null,
        imageUrl: m.media_type === "VIDEO" ? m.thumbnail_url || null : m.media_url || m.thumbnail_url || null,
        ...(m.username && { username: m.username }),
    };
};

/** Which hashtags a set of posts uses, and how those posts performed */
const hashtagsFromPosts = (posts) => {
    const map = new Map();
    for (const p of posts) {
        for (const tag of p.hashtags) {
            const s = map.get(tag) || { hashtag: tag, posts: 0, engagementSum: 0, samples: 0 };
            s.posts++;
            if (p.engagement != null) { s.engagementSum += p.engagement; s.samples++; }
            map.set(tag, s);
        }
    }
    return [...map.values()]
        .map(({ engagementSum, samples, ...s }) => ({ ...s, avgEngagement: samples ? Math.round(engagementSum / samples) : null }))
        .sort((a, b) => b.posts - a.posts || (b.avgEngagement || 0) - (a.avgEngagement || 0));
};

/** Followers + posts -> engagement rate, posts/week, best post, top hashtags */
const computeStats = (posts, followers) => {
    const withEng = posts.filter((p) => p.engagement != null);
    const avg = (arr, f) => (arr.length ? Math.round(arr.reduce((a, p) => a + (f(p) || 0), 0) / arr.length) : null);
    const avgLikes = avg(withEng, (p) => p.likes);
    const avgComments = avg(withEng, (p) => p.comments);
    const avgEngagement = avg(withEng, (p) => p.engagement);
    const last28 = posts.filter((p) => p.timestamp && Date.now() - new Date(p.timestamp).getTime() <= 28 * DAY_MS).length;
    return {
        postsAnalyzed: posts.length,
        avgLikes,
        avgComments,
        avgEngagement,
        // engagement rate = average (likes + comments) per post / followers
        engagementRate: followers && avgEngagement != null ? Math.round((avgEngagement / followers) * 10000) / 100 : null,
        postsPerWeek: Math.round((last28 / 4) * 10) / 10,
        bestPost: [...withEng].sort((a, b) => b.engagement - a.engagement)[0] || null,
        topHashtags: hashtagsFromPosts(posts).slice(0, 30),
        // oldest -> newest engagement, for a sparkline
        engagementTrend: [...withEng].reverse().map((p) => p.engagement),
    };
};

/** GET with a list of field sets: if Meta rejects a field, try the next (smaller) set */
const getWithFallback = async (url, params, fieldSets) => {
    let lastError;
    for (const fields of fieldSets) {
        try {
            return (await axios.get(url, { params: { ...params, fields }, timeout: TIMEOUT })).data;
        } catch (err) {
            lastError = err;
            const code = err.response?.data?.error?.code;
            if (![1, 100].includes(code)) break; // 100 = unknown field, 1 = too much data
        }
    }
    throw lastError;
};

// ───────── Your own account ─────────
const getInstagramAccountOverview = async ({ productId, userId, mediaLimit = 25, customToken, customIgUserId } = {}) => {
    let accessToken = customToken;
    let igUserId = customIgUserId;

    if (!accessToken) {
        const creds = await getAccountCredentials({ productId, userId, platform: "instagram" });
        if (creds?.accessToken) {
            accessToken = creds.accessToken;
            igUserId = creds.accountId;
        }
    }

    if (!accessToken && !userId) {
        accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
        igUserId = process.env.META_INSTAGRAM_USER_ID || process.env.INSTAGRAM_USER_ID;
    }

    if (!accessToken) throw Object.assign(new Error("No Instagram account connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });

    const version = process.env.INSTAGRAM_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
    const isMetaGraph = accessToken.startsWith("EA") || Boolean(igUserId) || !accessToken.startsWith("IG");
    const baseGraph = isMetaGraph ? FB_GRAPH : IG_GRAPH;
    const target = isMetaGraph && igUserId ? `${baseGraph}/${version}/${igUserId}` : `${baseGraph}/${version}/me`;

    const profile = await getWithFallback(target, { access_token: accessToken }, [
        "id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website",
        "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website",
        "id,username,name,profile_picture_url,followers_count,follows_count,media_count",
        "id,username,followers_count",
    ]);

    let posts = [];
    let mediaError = null;
    try {
        const media = await getWithFallback(`${target}/media`, { access_token: accessToken, limit: mediaLimit }, [
            "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url",
            "id,caption,media_type,permalink,timestamp,like_count,comments_count",
        ]);
        posts = (media.data || []).map(toPostView);
    } catch (err) {
        mediaError = apiErrorMessage(err);
        console.error("[InstagramAccount] media error:", mediaError);
    }

    return {
        profile: {
            id: profile.id || profile.user_id,
            username: profile.username,
            name: profile.name || "",
            accountType: profile.account_type || "",
            profilePictureUrl: profile.profile_picture_url || null,
            biography: profile.biography || "",
            website: profile.website || "",
            followers: num(profile.followers_count),
            following: num(profile.follows_count),
            mediaCount: num(profile.media_count),
        },
        stats: computeStats(posts, profile.followers_count),
        recentPosts: posts,
        ...(mediaError && { errors: { media: mediaError } }),
        source: "Instagram Graph API",
        fetchedAt: new Date().toISOString(),
    };
};

const getCompetitorAccount = async (rawUsername, { mediaLimit = 30, productId, userId: authUserId, customToken, customUserId } = {}) => {
    const username = String(rawUsername || "").trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username)) {
        throw Object.assign(new Error("Enter a valid Instagram username"), { statusCode: 400 });
    }

    let accessToken = customToken;
    let igUserId = customUserId;

    if (!accessToken || !igUserId) {
        const creds = await getAccountCredentials({ productId, userId: authUserId, platform: "instagram" });
        if (creds?.accessToken) {
            accessToken = creds.accessToken;
            igUserId = creds.accountId;
        }
    }

    if (!accessToken) accessToken = process.env.META_ACCESS_TOKEN;
    if (!igUserId) igUserId = process.env.META_INSTAGRAM_USER_ID;
    const version = process.env.META_GRAPH_API_VERSION || process.env.INSTAGRAM_API_VERSION || "v23.0";

    if (!accessToken || !igUserId) {
        throw Object.assign(new Error("No Instagram Business account connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });
    }

    const profileFields = "username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website";
    const mediaFields = [
        "id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url",
        "id,caption,like_count,comments_count,media_type,permalink,timestamp,media_url",
        "id,caption,like_count,comments_count,media_type,permalink,timestamp",
    ];

    let data;
    try {
        data = await getWithFallback(
            `${FB_GRAPH}/${version}/${igUserId}`,
            { access_token: accessToken },
            mediaFields.map((mf) => `business_discovery.username(${username}){${profileFields},media.limit(${mediaLimit}){${mf}}}`)
        );
    } catch (err) {
        const msg = apiErrorMessage(err);
        const notFound = /cannot be found|does not exist|not a business|Invalid user id/i.test(msg) || err.response?.data?.error?.error_subcode === 2207013;
        throw Object.assign(
            new Error(notFound ? `@${username} was not found, or it is a personal account (only Business/Creator accounts can be looked up).` : msg),
            { statusCode: notFound ? 404 : err.response?.status || 500 }
        );
    }

    const bd = data.business_discovery || {};
    const posts = (bd.media?.data || []).map(toPostView);
    return {
        profile: {
            username: bd.username || username,
            name: bd.name || "",
            profilePictureUrl: bd.profile_picture_url || null,
            biography: bd.biography || "",
            website: bd.website || "",
            followers: num(bd.followers_count),
            following: num(bd.follows_count),
            mediaCount: num(bd.media_count),
        },
        stats: computeStats(posts, bd.followers_count),
        recentPosts: posts,
        source: "Instagram Graph API (Business Discovery)",
        fetchedAt: new Date().toISOString(),
    };
};

// ───────── Single media insights & comments (Post Analyst) ─────────
const getInstagramMediaDetails = async (mediaId, { productId, userId, customToken } = {}) => {
    let accessToken = customToken;
    if (!accessToken) {
        const creds = await getAccountCredentials({ productId, userId, platform: "instagram" });
        if (creds?.accessToken) {
            accessToken = creds.accessToken;
        }
    }
    if (!accessToken && !userId) {
        accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    }
    if (!accessToken) throw Object.assign(new Error("No Instagram account connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });

    const cleanId = String(mediaId || "").trim();
    if (!cleanId) throw Object.assign(new Error("Media ID is required"), { statusCode: 400 });

    const version = process.env.INSTAGRAM_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
    const isMetaGraph = accessToken.startsWith("EA") || !accessToken.startsWith("IG");
    const baseGraph = isMetaGraph ? FB_GRAPH : IG_GRAPH;

    // 1. Fetch base media data
    let mediaData = null;
    try {
        mediaData = await getWithFallback(
            `${baseGraph}/${version}/${cleanId}`,
            { access_token: accessToken },
            [
                "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url",
                "id,caption,media_type,permalink,timestamp,like_count,comments_count,media_url",
                "id,caption,media_type,permalink,timestamp,like_count,comments_count",
            ]
        );
    } catch (err) {
        throw Object.assign(new Error(apiErrorMessage(err) || "Failed to fetch media"), {
            statusCode: err.response?.status || 500,
        });
    }

    const postView = toPostView(mediaData);

    // 2. Fetch insights (reach, saved) - graceful fallback if unsupported for this media type
    let reach = null;
    let saved = null;
    try {
        const ins = await axios.get(`${baseGraph}/${version}/${cleanId}/insights`, {
            params: { access_token: accessToken, metric: "reach,saved" },
            timeout: TIMEOUT,
        });
        for (const item of ins.data?.data || []) {
            if (item.name === "reach") reach = num(item.values?.[0]?.value);
            if (item.name === "saved") saved = num(item.values?.[0]?.value);
        }
    } catch {
        // Some media types (e.g. reels or older albums) may not support specific metric sets
    }

    // 3. Fetch real audience comments
    let comments = [];
    try {
        const cRes = await axios.get(`${baseGraph}/${version}/${cleanId}/comments`, {
            params: {
                access_token: accessToken,
                fields: "id,text,timestamp,username,like_count",
                limit: 30,
            },
            timeout: TIMEOUT,
        });
        comments = (cRes.data?.data || []).map((c) => ({
            id: c.id,
            text: c.text,
            username: c.username || "anonymous",
            timestamp: c.timestamp,
            likes: num(c.like_count) || 0,
        }));
    } catch {
        // Comments may be empty or restricted
    }

    return {
        ...postView,
        reach,
        saved,
        comments,
        commentsList: comments,
        source: "Instagram Graph API",
        fetchedAt: new Date().toISOString(),
    };
};

module.exports = {
    getInstagramAccountOverview,
    getCompetitorAccount,
    getInstagramMediaDetails,
    toPostView,
    hashtagsFromPosts,
    computeStats,
};
