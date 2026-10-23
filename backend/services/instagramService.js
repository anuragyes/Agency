
const axios = require("axios");
const { getAccountCredentials } = require("./tokenService.js");
const GRAPH_API = "https://graph.instagram.com";
// Hashtag Search API only exists on graph.facebook.com and needs a Facebook (EAA...) token
const META_GRAPH_API = "https://graph.facebook.com";

const isMetaToken = (t) => {
    if (!t) return false;
    const str = String(t).trim();
    return str.startsWith("EA") || !str.startsWith("IG");
};

const getInstagramProfile = async (customToken) => {
    try {
        const creds = await getAccountCredentials({ platform: "instagram" });
        const token = customToken || creds?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
        const accountId = creds?.accountId || process.env.INSTAGRAM_USER_ID;
        const version = process.env.INSTAGRAM_API_VERSION || "v23.0";

        if (!token) throw new Error("No active Instagram account connected or token provided.");

        const isMetaOAuth = isMetaToken(token);
        const endpoint = isMetaOAuth
            ? `https://graph.facebook.com/${version}/${accountId || "me"}`
            : "https://graph.instagram.com/me";

        const response = await axios.get(endpoint, {
            params: {
                fields: isMetaOAuth ? "id,username" : "user_id,username",
                access_token: token,
            },
        });

        return {
            user_id: response.data.id || response.data.user_id,
            username: response.data.username,
        };
    } catch (error) {
        console.error(
            "Instagram API Error:",
            error.response?.data || error.message
        );

        throw new Error(error.response?.data?.error?.message || "Failed to fetch Instagram profile");
    }
};

const getInstagramFollowers = async (customToken) => {
    const creds = await getAccountCredentials({ platform: "instagram" });
    const accessToken = customToken || creds?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = creds?.accountId || process.env.INSTAGRAM_USER_ID;
    const version = process.env.INSTAGRAM_API_VERSION || "v23.0";

    if (!accessToken) {
        throw new Error("No active Instagram account connected. Please connect your account in Accounts page.");
    }

    const isMetaOAuth = isMetaToken(accessToken);
    const endpoint = isMetaOAuth
        ? `https://graph.facebook.com/${version}/${accountId}`
        : `https://graph.instagram.com/${version}/me`;

    try {
        const response = await axios.get(endpoint, {
            params: {
                fields: "id,username,name,profile_picture_url,followers_count,follows_count,media_count",
                access_token: accessToken,
            },
        });
        return {
            ...response.data,
            user_id: response.data.id || response.data.user_id,
        };
    } catch (error) {
        console.error("Instagram API Error:", error.response?.data?.error || error.message);
        throw error;
    }
};

// instagram story feature 
const publishInstagramStory = async ({ mediaUrl, mediaType, customToken, customIgUserId }) => {
    try {
        const creds = await getAccountCredentials({ platform: "instagram" });
        const accessToken = customToken || creds?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
        const instagramUserId = customIgUserId || creds?.accountId || process.env.INSTAGRAM_USER_ID;
        const apiVersion = process.env.INSTAGRAM_API_VERSION || "v23.0";

        if (!accessToken || !instagramUserId) {
            throw new Error("Instagram account credentials not found. Please connect your account in Accounts page.");
        }

        if (!mediaUrl) {
            throw new Error("Media URL is required");
        }

        if (!["IMAGE", "VIDEO"].includes(mediaType)) {
            throw new Error("mediaType must be IMAGE or VIDEO");
        }

        const isMetaOAuth = isMetaToken(accessToken);
        const base = isMetaOAuth ? "https://graph.facebook.com" : GRAPH_API;

        // Step 1: Create Instagram Story container
        const containerResponse = await axios.post(
            `${base}/${apiVersion}/${instagramUserId}/media`,
            {
                media_type: "STORIES",
                ...(mediaType === "IMAGE"
                    ? { image_url: mediaUrl }
                    : { video_url: mediaUrl }),
                access_token: accessToken,
            }
        );

        const creationId = containerResponse.data.id;

        // Step 2: Publish Instagram Story
        const publishResponse = await axios.post(
            `${base}/${apiVersion}/${instagramUserId}/media_publish`,
            {
                creation_id: creationId,
                access_token: accessToken,
            }
        );

        return {
            success: true,
            message: "Instagram Story published successfully",
            data: {
                creationId,
                mediaId: publishResponse.data.id,
                mediaType,
            },
        };
    } catch (error) {
        console.error(
            "Instagram Story Publishing Error:",
            error.response?.data || error.message
        );

        throw new Error(
            error.response?.data?.error?.message ||
            error.message ||
            "Failed to publish Instagram Story"
        );
    }
};




// ─────────────────────────────────────────────────────────────
// HASHTAGS — official Instagram Graph API (Hashtag Search)
//   1. ig_hashtag_search?q=ghee        -> hashtag id
//   2. /{hashtag-id}/top_media          -> most popular posts using it (right now)
//   3. /{hashtag-id}/recent_media       -> posts from the LAST 24 HOURS
// Rules from Meta:
//   - needs the Facebook (EAA...) token on graph.facebook.com (IGAA token does not work)
//   - max 30 UNIQUE hashtags searched per Instagram account in a rolling 7 days
//     -> ids are cached in Mongo (models/HashtagCache.js), so a repeat search costs nothing
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const HashtagCache = require("../models/HashtagCache.js");
const HashtagMediaCache = require("../models/HashtagMediaCache.js");
const { metaGet, shouldAskForLess } = require("./metaClient.js");

const HASHTAG_WEEKLY_LIMIT = Number(process.env.INSTAGRAM_HASHTAG_WEEKLY_LIMIT) || 30;
// Posts cache: top posts change slowly, "recent" = last 24h so it must stay fresh
const TOP_CACHE_MS = (Number(process.env.INSTAGRAM_TOP_CACHE_HOURS) || 24) * 60 * 60 * 1000;
const RECENT_CACHE_MS = (Number(process.env.INSTAGRAM_RECENT_CACHE_HOURS) || 6) * 60 * 60 * 1000;
// Was 60s: with 5 "ask for less data" retries one edge could hang for 5 minutes
const HASHTAG_HTTP_TIMEOUT_MS = Number(process.env.INSTAGRAM_HASHTAG_TIMEOUT_MS) || 25000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_FOUND_RETRY_MS = 30 * 24 * 60 * 60 * 1000; // re-check "no such hashtag" after 30 days

const memoryIdCache = new Map();   // fallback when Mongo is not connected
const mediaCache = new Map();      // fallback when Mongo is not connected: `${hashtagId}:${edge}` -> entry
const workingAttempt = new Map();  // `${hashtagId}:${edge}:${withMediaUrl}` -> index of the field set Meta accepted last time

const HASHTAG_FULL_FIELDS = "id,caption,media_type,permalink,timestamp,like_count,comments_count";
const HASHTAG_LIGHT_FIELDS = "id,caption,media_type,permalink,timestamp";
// Popular hashtags (e.g. "fashion") make Meta fail with code 1 "Please reduce the amount of data..."
// -> ask for a smaller page / lighter fields and retry
const HASHTAG_MEDIA_ATTEMPTS = [
    { fields: `${HASHTAG_FULL_FIELDS},media_url`, limit: 50 },   // media_url = thumbnail for the Hashtags page UI
    { fields: HASHTAG_FULL_FIELDS, limit: 50 },
    { fields: HASHTAG_FULL_FIELDS, limit: 25 },
    { fields: HASHTAG_FULL_FIELDS, limit: 10 },
    { fields: HASHTAG_LIGHT_FIELDS, limit: 10 },
];
// Research only needs caption + likes + comments (no media_url).
// Real logs (Oct 2026): limit=50 almost always ends in "reduce the amount of data" or a timeout after ~24s,
// limit=25 usually answers in 12–22s, limit=10 in ~12s. So research starts at 25 and steps down.
const RESEARCH_PAGE_SIZE = [50, 25, 10].includes(Number(process.env.INSTAGRAM_RESEARCH_PAGE_SIZE))
    ? Number(process.env.INSTAGRAM_RESEARCH_PAGE_SIZE) : 25;
const RESEARCH_MEDIA_ATTEMPTS = HASHTAG_MEDIA_ATTEMPTS.slice(1).filter((a) => a.limit <= RESEARCH_PAGE_SIZE);
// Research pages per edge: enough pages for minPosts at the page size Meta accepted, never more than this
const RESEARCH_MAX_PAGES = Math.max(1, Number(process.env.INSTAGRAM_RESEARCH_MAX_PAGES) || 6);
// More pages = more posts = more hashtags (each page = 1 normal API call, NOT a hashtag-search quota hit)
const HASHTAG_MAX_PAGES = Math.max(1, Number(process.env.INSTAGRAM_HASHTAG_PAGES) || 3);

const dbReady = () => mongoose.connection.readyState === 1;

const readMediaCache = async (key) => {
    if (dbReady()) {
        try {
            const doc = await HashtagMediaCache.findOne({ key }).lean();
            if (doc) return doc;
        } catch (err) {
            console.warn("[HashtagMediaCache] read failed:", err.message);
        }
    }
    return mediaCache.get(key) || null;
};

const saveMediaCache = async (entry) => {
    mediaCache.set(entry.key, entry);
    if (dbReady()) {
        try {
            await HashtagMediaCache.updateOne({ key: entry.key }, { $set: entry }, { upsert: true });
        } catch (err) {
            console.warn("[HashtagMediaCache] save failed:", err.message);
        }
    }
};

const cacheMsFor = (edge) => (edge === "recent_media" ? RECENT_CACHE_MS : TOP_CACHE_MS);

/**
 * Posts for one hashtag, with details about where they came from.
 * edge = "top_media" | "recent_media". Throws if the FIRST page fails.
 *
 * @param {string} hashtagId
 * @param {string} edge
 * @param {Object}  [opts]
 * @param {boolean} [opts.withMediaUrl=true]  false = research mode (no thumbnails, faster, smaller pages)
 * @param {number}  [opts.minPosts=Infinity]  stop paging once we have this many posts (Infinity = up to maxPages)
 * @param {number}  [opts.maxPages]           page cap (default: Hashtags page 3; research = pages needed for minPosts, max 6)
 * @param {number}  [opts.deadline]           timestamp: don't START another page after this (page 1 always runs)
 * @param {boolean} [opts.refresh=false]      ignore the cache (pre-warm job)
 * @param {string}  [opts.label]              for the timing log, e.g. "#coffee"
 * @returns {Promise<{ media: Array, fromCache: boolean, complete: boolean, pages: number, fetchedAt: Date }>}
 */
const getHashtagMediaDetailed = async (hashtagId, edge, {
    withMediaUrl = true,
    minPosts = Infinity,
    maxPages,
    deadline = Infinity,
    refresh = false,
    label = hashtagId,
} = {}) => {
    const key = `${hashtagId}:${edge}`;
    const ladder = withMediaUrl ? HASHTAG_MEDIA_ATTEMPTS : RESEARCH_MEDIA_ATTEMPTS;
    const pageCap = (limit) => maxPages
        ?? (Number.isFinite(minPosts) ? Math.min(RESEARCH_MAX_PAGES, Math.ceil(minPosts / (limit || 25)) + 1) : HASHTAG_MAX_PAGES);
    const enough = (e) => e.media.length >= minPosts || e.complete || e.pages >= pageCap(e.limit);

    // 1. Cache: fresh + has thumbnails if the caller needs them
    let entry = refresh ? null : await readMediaCache(key);
    if (entry && (Date.now() - new Date(entry.fetchedAt).getTime() >= cacheMsFor(edge) || (withMediaUrl && !entry.withMediaUrl))) {
        entry = null;
    }
    if (entry && (enough(entry) || Date.now() >= deadline)) {
        return { media: entry.media, fromCache: true, complete: entry.complete, pages: entry.pages, fetchedAt: entry.fetchedAt };
    }

    const { accessToken, userId, version } = getHashtagCredentials();
    const url = `${META_GRAPH_API}/${version}/${hashtagId}/${edge}`;
    const memoKey = `${key}:${withMediaUrl}`;
    let fromCache = Boolean(entry);
    let used, after, media, pages;
    const rungOf = (u) => Math.max(0, ladder.findIndex((a) => a.fields === u.fields && a.limit === u.limit));

    if (entry?.after) {
        // 2a. Cached, but not enough posts yet -> CONTINUE from the saved cursor (no re-download)
        used = { fields: entry.fields, limit: entry.limit };
        after = entry.after;
        media = [...entry.media];
        pages = entry.pages;
    } else {
        // 2b. Page 1: find a field set / page size Meta accepts (start with the one that worked last time).
        //     "reduce data" OR a timeout -> ask for less (never repeat the same heavy request)
        fromCache = false;
        let lastError, page;
        for (let i = Math.min(workingAttempt.get(memoKey) || 0, ladder.length - 1); i < ladder.length; i++) {
            try {
                const res = await metaGet(url, { user_id: userId, ...ladder[i], access_token: accessToken }, {
                    timeout: HASHTAG_HTTP_TIMEOUT_MS,
                    label: `${edge} ${label} p1 limit=${ladder[i].limit}`,
                });
                page = res.data;
                used = ladder[i];
                workingAttempt.set(memoKey, i);
                break;
            } catch (err) {
                lastError = err;
                console.error(" INSTAGRAM API ERROR", {
                    edge,
                    url,
                    message: err.message,
                    code: err.code,
                    status: err.response?.status,
                    data: err.response?.data,
                });
                if (!shouldAskForLess(err)) break; // only "too much data" / too slow -> smaller page
            }
        }
        if (!page) throw lastError;
        media = [...(page.data || [])];
        pages = 1;
        after = page.paging?.next ? page.paging?.cursors?.after || null : null;
    }

    // 3. Next pages until we have enough. A heavy page -> same cursor with a smaller page; other errors stop quietly.
    while (media.length < minPosts && pages < pageCap(used.limit) && after && Date.now() < deadline) {
        try {
            const res = await metaGet(url, { user_id: userId, ...used, after, access_token: accessToken }, {
                timeout: HASHTAG_HTTP_TIMEOUT_MS,
                label: `${edge} ${label} p${pages + 1} limit=${used.limit}`,
            });
            const page = res.data;
            media.push(...(page.data || []));
            pages++;
            after = page.paging?.next ? page.paging?.cursors?.after || null : null;
        } catch (err) {
            const smaller = ladder[rungOf(used) + 1];
            if (shouldAskForLess(err) && smaller && Date.now() < deadline) {
                console.warn(`[Hashtag] ${edge} ${label} page ${pages + 1}: ${apiErrorMessage(err)} -> retry with limit=${smaller.limit}`);
                used = smaller;
                workingAttempt.set(memoKey, rungOf(used));
                continue;
            }
            console.warn(`[Hashtag] ${edge} page ${pages + 1} failed:`, apiErrorMessage(err));
            break;
        }
    }

    const unique = [...new Map(media.map((m) => [m.id, m])).values()];
    const fetchedAt = entry && fromCache ? entry.fetchedAt : new Date();
    const saved = {
        key,
        hashtagId: String(hashtagId),
        edge,
        media: unique,
        withMediaUrl: used.fields.includes("media_url"),
        fields: used.fields,
        limit: used.limit,
        after,
        pages,
        complete: !after,
        fetchedAt,
        expiresAt: new Date(new Date(fetchedAt).getTime() + cacheMsFor(edge)),
    };
    await saveMediaCache(saved);
    return { media: unique, fromCache, complete: saved.complete, pages, fetchedAt };
};

/** Posts for one hashtag (old signature, used by the Hashtags page, discovery and hashtag-search) */
const getHashtagMedia = async (hashtagId, edge, opts) => (await getHashtagMediaDetailed(hashtagId, edge, opts)).media;

const getHashtagCredentials = async () => {
    const creds = await getAccountCredentials({ platform: "instagram" });
    const accessToken = creds?.accessToken || process.env.META_ACCESS_TOKEN;
    const userId = creds?.accountId || process.env.META_INSTAGRAM_USER_ID;
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";
    if (!accessToken || !userId) {
        throw new Error("Instagram hashtag API credentials are missing (No active Instagram account connected)");
    }
    return { accessToken, userId, version };
};

/** True when the hashtag API can be used (credentials set and not switched off) */
const isHashtagApiConfigured = () =>
    process.env.INSTAGRAM_LIVE_HASHTAGS !== "false";

/** "#Organic Ghee!" -> "organicghee" (Instagram hashtags = letters, numbers, underscore) */
const normalizeHashtag = (value) =>
    String(value || "").replace(/^#+/, "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");

/** All unique hashtags inside a caption, normalized, without "#" */
const extractHashtags = (caption) => {
    const found = String(caption || "").match(/#[\p{L}\p{N}_]+/gu) || [];
    return [...new Set(found.map(normalizeHashtag).filter((t) => t.length > 1))];
};

const readCachedHashtag = async (hashtag) => {
    if (dbReady()) {
        try {
            const doc = await HashtagCache.findOne({ hashtag }).lean();
            if (doc) return doc;
        } catch (err) {
            console.warn("[HashtagCache] read failed:", err.message);
        }
    }
    return memoryIdCache.get(hashtag) || null;
};

const saveCachedHashtag = async ({ hashtag, hashtagId }) => {
    const entry = { hashtag, hashtagId, notFound: !hashtagId, searchedAt: new Date(), lastUsedAt: new Date() };
    memoryIdCache.set(hashtag, entry);
    if (dbReady()) {
        try {
            await HashtagCache.updateOne({ hashtag }, { $set: entry }, { upsert: true });
        } catch (err) {
            console.warn("[HashtagCache] save failed:", err.message);
        }
    }
};

/** How many NEW hashtags we searched in the last 7 days (Meta's 30/week limit) */
const countHashtagSearchesThisWeek = async () => {
    const since = new Date(Date.now() - WEEK_MS);
    if (dbReady()) {
        try {
            return await HashtagCache.countDocuments({ searchedAt: { $gte: since } });
        } catch (err) {
            console.warn("[HashtagCache] count failed:", err.message);
        }
    }
    return [...memoryIdCache.values()].filter((e) => new Date(e.searchedAt) >= since).length;
};

/**
 * Meta's OWN list of hashtags this account searched in the last 7 days (the source of truth for the
 * 30/week limit; our Mongo count can miss searches made by other tools). null when Meta doesn't answer.
 */
const countMetaRecentlySearchedHashtags = async () => {
    try {
        const { accessToken, userId, version } = await getHashtagCredentials();
        const res = await metaGet(`${META_GRAPH_API}/${version}/${userId}/recently_searched_hashtags`,
            { fields: "id,name", limit: 30, access_token: accessToken },
            { timeout: HASHTAG_HTTP_TIMEOUT_MS, label: "recently_searched_hashtags" });
        return Array.isArray(res.data?.data) ? res.data.data.length : null;
    } catch (err) {
        console.warn("[Hashtag] recently_searched_hashtags failed:", apiErrorMessage(err));
        return null;
    }
};

/** Cached id info WITHOUT searching (no quota). null = never searched */
const peekCachedHashtag = async (rawHashtag) => {
    const hashtag = normalizeHashtag(rawHashtag);
    return hashtag ? readCachedHashtag(hashtag) : null;
};

/** Remember that research used this hashtag (the pre-warm job keeps these fresh). Fire and forget. */
const markHashtagUsed = (hashtag) => {
    const mem = memoryIdCache.get(hashtag);
    if (mem) mem.lastUsedAt = new Date();
    if (dbReady()) {
        HashtagCache.updateOne({ hashtag }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    }
};

/** Hashtags (with an id) that research used recently, most recent first -> [{ hashtag, hashtagId }] */
const listRecentlyUsedHashtags = async ({ limit = 15, sinceMs = WEEK_MS } = {}) => {
    const since = new Date(Date.now() - sinceMs);
    if (dbReady()) {
        try {
            return await HashtagCache.find({ hashtagId: { $ne: null }, lastUsedAt: { $gte: since } })
                .sort({ lastUsedAt: -1 }).limit(limit).select({ hashtag: 1, hashtagId: 1, _id: 0 }).lean();
        } catch (err) {
            console.warn("[HashtagCache] list failed:", err.message);
        }
    }
    return [...memoryIdCache.values()]
        .filter((e) => e.hashtagId && e.lastUsedAt && new Date(e.lastUsedAt) >= since)
        .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
        .slice(0, limit)
        .map(({ hashtag, hashtagId }) => ({ hashtag, hashtagId }));
};

// New searches run one at a time (even when seeds / jobs run in parallel):
// "count this week's searches -> search -> save" must not interleave, or two requests
// could both see 29/30 and together spend 31.
let searchChain = Promise.resolve();
const oneAtATime = (fn) => {
    const run = searchChain.then(fn, fn);
    searchChain = run.catch(() => {});
    return run;
};

/**
 * Hashtag name -> Instagram hashtag id (cached; only a NEW hashtag uses quota)
 * @param {string} rawHashtag
 * @param {Object} [opts]
 * @param {boolean} [opts.markUsed=true]  false for the pre-warm job (it must not keep hashtags "in use" forever)
 */
const getHashtagId = async (rawHashtag, { markUsed = true } = {}) => {
    const hashtag = normalizeHashtag(rawHashtag);
    if (!hashtag) {
        throw Object.assign(new Error("Hashtag query is required"), { statusCode: 400 });
    }

    const fromCacheOrNull = async () => {
        const cached = await readCachedHashtag(hashtag);
        if (cached?.hashtagId) {
            if (markUsed) markHashtagUsed(hashtag);
            return { hashtag, hashtagId: cached.hashtagId, fromCache: true };
        }
        if (cached?.notFound && Date.now() - new Date(cached.searchedAt).getTime() < NOT_FOUND_RETRY_MS) {
            return { hashtag, hashtagId: null, fromCache: true };
        }
        return null;
    };

    const hit = await fromCacheOrNull();
    if (hit) return hit;

    return oneAtATime(async () => {
        const again = await fromCacheOrNull(); // another request may have searched it while we waited
        if (again) return again;

        const used = await countHashtagSearchesThisWeek();
        if (used >= HASHTAG_WEEKLY_LIMIT) {
            throw Object.assign(
                new Error(`Instagram hashtag search limit reached: ${HASHTAG_WEEKLY_LIMIT} new hashtags per 7 days. Already-searched hashtags still work.`),
                { statusCode: 429, code: "HASHTAG_WEEKLY_LIMIT" }
            );
        }

        const { accessToken, userId, version } = await getHashtagCredentials();
        const res = await metaGet(`${META_GRAPH_API}/${version}/ig_hashtag_search`,
            { user_id: userId, q: hashtag, access_token: accessToken },
            { timeout: HASHTAG_HTTP_TIMEOUT_MS, label: `ig_hashtag_search #${hashtag}` });
        const hashtagId = res.data?.data?.[0]?.id || null;
        await saveCachedHashtag({ hashtag, hashtagId });
        return { hashtag, hashtagId, fromCache: false };
    });
};



const apiErrorMessage = (err) => err?.response?.data?.error?.message || err?.message || "Unknown Instagram API error";

/**
 * Count the hashtags real creators use together with the searched hashtag(s).
 * @param {Array<{seed:string, edge:string, media:Array}>} groups
 * @returns ranked [{ hashtag:"#x", score, posts, topPosts, recentPosts24h, avgLikes, avgComments, seenWith, isSeed }]
 */
const rankCoOccurringHashtags = (groups, seeds = []) => {
    const seedSet = new Set(seeds.map(normalizeHashtag));
    const stats = new Map();
    const seenMedia = new Set();

    for (const { seed, edge, media } of groups) {
        for (const post of media || []) {
            const postKey = `${seed}:${edge}:${post.id}`;
            if (seenMedia.has(postKey)) continue;
            seenMedia.add(postKey);

            for (const tag of extractHashtags(post.caption)) {
                const s = stats.get(tag) || {
                    tag, postIds: new Set(), topPosts: 0, recentPosts24h: 0,
                    likes: 0, likeSamples: 0, comments: 0, commentSamples: 0, seenWith: new Set(),
                };
                if (!s.postIds.has(post.id)) {
                    s.postIds.add(post.id);
                    if (Number.isFinite(post.like_count)) { s.likes += post.like_count; s.likeSamples++; }
                    if (Number.isFinite(post.comments_count)) { s.comments += post.comments_count; s.commentSamples++; }
                }
                if (edge === "top_media") s.topPosts++;
                if (edge === "recent_media") s.recentPosts24h++;
                s.seenWith.add(seed);
                stats.set(tag, s);
            }
        }
    }

    return [...stats.values()]
        .map((s) => {
            const avgLikes = s.likeSamples ? Math.round(s.likes / s.likeSamples) : null;
            const avgComments = s.commentSamples ? Math.round(s.comments / s.commentSamples) : null;
            const engagement = (avgLikes || 0) + (avgComments || 0);
            // relative score: used in top posts + active in last 24h + shared across several seeds + engagement
            const score = s.topPosts * 2 + s.recentPosts24h + (s.seenWith.size - 1) * 3 + Math.log10(1 + engagement);
            return {
                hashtag: `#${s.tag}`,
                score: Math.round(score * 10) / 10,
                posts: s.postIds.size,
                topPosts: s.topPosts,
                recentPosts24h: s.recentPosts24h,
                avgLikes,
                avgComments,
                seenWith: [...s.seenWith].map((t) => `#${t}`),
                isSeed: seedSet.has(s.tag),
            };
        })
        .sort((a, b) => b.score - a.score || b.posts - a.posts);
};

// GET /api/instagram/instagram/hashtag-search?q=ghee
const searchInstagramHashtag = async (query) => {
    try {
        const { hashtag, hashtagId, fromCache } = await getHashtagId(query);

        if (!hashtagId) {
            return { success: true, hashtag, message: "No hashtag found", data: null };
        }

        // One edge failing shouldn't throw away the other
        const [top, recent] = await Promise.allSettled([
            getHashtagMedia(hashtagId, "top_media"),
            getHashtagMedia(hashtagId, "recent_media"),
        ]);




        console.log("this is top hastages", top);
        console.log("this sis recent hashtag", recent)
        const topMedia = top.status === "fulfilled" ? top.value : [];
        const recentMedia = recent.status === "fulfilled" ? recent.value : [];

        const errors = {
            ...(top.status === "rejected" && { topMedia: apiErrorMessage(top.reason) }),
            ...(recent.status === "rejected" && { recentMedia: apiErrorMessage(recent.reason) }),
        };
        if (Object.keys(errors).length) console.error(`Hashtag #${hashtag} edge errors:`, errors);

        console.log(`[Hashtag] #${hashtag}: top=${topMedia.length}, recent(24h)=${recentMedia.length}, idFromCache=${fromCache}`);

        const relatedHashtags = rankCoOccurringHashtags(
            [
                { seed: hashtag, edge: "top_media", media: topMedia },
                { seed: hashtag, edge: "recent_media", media: recentMedia },
            ],
            [hashtag]
        ).slice(0, 30);

        return {
            success: true,
            hashtag,
            hashtagId,
            hashtags: relatedHashtags.map(item => item.hashtag),
            source: "Instagram Graph API",
            verificationStatus: "api_data_retrieved",
            fetchedAt: new Date().toISOString(),
        };
    } catch (error) {
        console.error("Instagram Hashtag Research Error:", error.response?.data || error.message);
        throw Object.assign(new Error(apiErrorMessage(error) || "Failed to search Instagram hashtag"), {
            statusCode: error.statusCode || error.response?.status || 500,
            code: error.code,
        });
    }
};


module.exports = {
    getInstagramProfile,
    getInstagramFollowers,
    publishInstagramStory,
    searchInstagramHashtag,
    // used by services/instagramHashtagResearchService.js
    getHashtagId,
    getHashtagMedia,
    getHashtagMediaDetailed,
    listRecentlyUsedHashtags,
    peekCachedHashtag,
    countMetaRecentlySearchedHashtags,
    rankCoOccurringHashtags,
    normalizeHashtag,
    extractHashtags,
    isHashtagApiConfigured,
    apiErrorMessage,
    countHashtagSearchesThisWeek,
    HASHTAG_WEEKLY_LIMIT,
};
