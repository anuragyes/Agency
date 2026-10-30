// ─────────────────────────────────────────────────────────────
// services/competitors/providers/youtube.js — YouTube Competitor & Channel Intelligence
// Powered by official Google YouTube Data API v3.
// Works for any public creator or brand channel (subscribers, views, Shorts vs Long-form videos).
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MEDIA_LIMIT = Math.min(50, Number(process.env.COMPETITOR_MEDIA_LIMIT) || 30);

const getApiKey = () => {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
        throw Object.assign(
            new Error("YOUTUBE_API_KEY is missing in backend/.env. Please add your Google Cloud YouTube API key."),
            { statusCode: 500 }
        );
    }
    return key;
};

/**
 * Clean and parse channel handle or URL from user input
 * Supports:
 *   - @mkbhd or mkbhd
 *   - https://www.youtube.com/@mkbhd
 *   - https://www.youtube.com/channel/UCBJycsmduPTeAO0NO4-1FdA
 *   - https://www.youtube.com/c/MarquesBrownlee
 */
const parseChannelQuery = (input) => {
    const raw = String(input || "").trim();
    if (!raw) return { handle: "", channelId: "", query: "" };

    // Direct channel ID (starts with UC and 24 chars)
    const directChannelIdMatch = raw.match(/UC[a-zA-Z0-9_-]{22}/);
    if (directChannelIdMatch) {
        return { channelId: directChannelIdMatch[0], handle: "", query: directChannelIdMatch[0] };
    }

    // URL with handle /@handle
    const urlHandleMatch = raw.match(/(?:youtube\.com|youtu\.be)\/@([a-zA-Z0-9._-]+)/i);
    if (urlHandleMatch) {
        return { handle: urlHandleMatch[1].toLowerCase(), channelId: "", query: urlHandleMatch[1] };
    }

    // Direct @handle input
    if (raw.startsWith("@")) {
        const clean = raw.slice(1).replace(/[/?#].*$/, "").trim().toLowerCase();
        return { handle: clean, channelId: "", query: clean };
    }

    // Clean plain username
    const clean = raw.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "").replace(/[/?#].*$/, "").trim();
    return { handle: clean.toLowerCase(), channelId: "", query: clean };
};

/**
 * Parse ISO 8601 duration string (e.g. PT47S, PT12M34S, PT1H2M3S) into seconds
 */
const parseDurationSec = (durationStr) => {
    if (!durationStr) return 0;
    const match = String(durationStr).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || 0, 10);
    const mins = parseInt(match[2] || 0, 10);
    const secs = parseInt(match[3] || 0, 10);
    return hours * 3600 + mins * 60 + secs;
};

/**
 * Look up channel details via YouTube Data API
 */
const fetchChannelDetails = async (input, key) => {
    const { handle, channelId, query } = parseChannelQuery(input);

    let channelItem = null;

    // 1. Try by channelId if UC...
    if (channelId) {
        try {
            const res = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
                params: { part: "snippet,statistics,contentDetails", id: channelId, key },
                timeout: 10000,
            });
            if (res.data?.items?.length) channelItem = res.data.items[0];
        } catch { /* fallback to other methods */ }
    }

    // 2. Try by handle (modern official YouTube handle lookup)
    if (!channelItem && handle) {
        try {
            const res = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
                params: { part: "snippet,statistics,contentDetails", forHandle: handle, key },
                timeout: 10000,
            });
            if (res.data?.items?.length) channelItem = res.data.items[0];
        } catch { /* fallback to search */ }
    }

    // 3. Fallback: Search for the channel by query
    if (!channelItem && query) {
        try {
            const searchRes = await axios.get(`${YOUTUBE_API_BASE}/search`, {
                params: { part: "snippet", type: "channel", q: query, maxResults: 1, key },
                timeout: 10000,
            });
            const foundId = searchRes.data?.items?.[0]?.snippet?.channelId;
            if (foundId) {
                const res = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
                    params: { part: "snippet,statistics,contentDetails", id: foundId, key },
                    timeout: 10000,
                });
                if (res.data?.items?.length) channelItem = res.data.items[0];
            }
        } catch { /* handled below */ }
    }

    if (!channelItem) {
        throw Object.assign(
            new Error(`YouTube channel "${input}" was not found. Please verify the channel handle or URL.`),
            { statusCode: 404 }
        );
    }

    return channelItem;
};

/**
 * Fetch a channel's recent uploads playlist items + video statistics & durations
 */
const fetchRecentVideos = async (uploadsPlaylistId, limit, key) => {
    if (!uploadsPlaylistId) return [];

    try {
        const playlistRes = await axios.get(`${YOUTUBE_API_BASE}/playlistItems`, {
            params: {
                part: "snippet,contentDetails",
                playlistId: uploadsPlaylistId,
                maxResults: Math.min(50, Math.max(limit, 5)),
                key,
            },
            timeout: 10000,
        });

        const items = playlistRes.data?.items || [];
        if (!items.length) return [];

        const videoIds = items.map((i) => i.contentDetails?.videoId).filter(Boolean).join(",");
        if (!videoIds) return [];

        // Batch fetch video statistics & durations
        const videoRes = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
            params: {
                part: "snippet,statistics,contentDetails",
                id: videoIds,
                key,
            },
            timeout: 10000,
        });

        const videoMap = new Map((videoRes.data?.items || []).map((v) => [v.id, v]));

        return items.map((item) => {
            const vid = item.contentDetails?.videoId;
            const full = videoMap.get(vid);
            const snippet = full?.snippet || item.snippet || {};
            const stats = full?.statistics || {};
            const content = full?.contentDetails || {};

            const likes = parseInt(stats.likeCount || 0, 10);
            const comments = parseInt(stats.commentCount || 0, 10);
            const views = parseInt(stats.viewCount || 0, 10);
            const durationSec = parseDurationSec(content.duration);
            const isShort = durationSec > 0 && durationSec <= 60;

            const thumb =
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.medium?.url ||
                snippet.thumbnails?.default?.url ||
                null;

            return {
                id: vid,
                imageUrl: thumb,
                permalink: `https://www.youtube.com/watch?v=${vid}`,
                likes,
                comments,
                views,
                durationSec,
                // "REELS" maps to "reel" (Shorts), "VIDEO" maps to long-form video in Sociva analyzer
                mediaType: isShort ? "REEL" : "VIDEO",
                productType: isShort ? "REELS" : "VIDEO",
                caption: snippet.title || "",
                description: snippet.description || "",
                timestamp: snippet.publishedAt || item.snippet?.publishedAt || new Date().toISOString(),
                engagement: likes + comments,
            };
        });
    } catch (err) {
        console.warn("[YouTubeProvider] Error fetching recent videos:", err.message);
        return [];
    }
};

/**
 * Compute performance metrics for a channel
 */
const computeYouTubeStats = (videos = [], subscriberCount = 0) => {
    if (!videos.length) {
        return {
            engagementRate: 0,
            avgLikes: 0,
            avgComments: 0,
            avgViews: 0,
            postsPerWeek: 0,
            shortsCount: 0,
            videosCount: 0,
            engagementTrend: [],
        };
    }

    const totalLikes = videos.reduce((sum, v) => sum + (v.likes || 0), 0);
    const totalComments = videos.reduce((sum, v) => sum + (v.comments || 0), 0);
    const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
    const shortsCount = videos.filter((v) => v.productType === "REELS").length;
    const videosCount = videos.length - shortsCount;

    const avgLikes = Math.round(totalLikes / videos.length);
    const avgComments = Math.round(totalComments / videos.length);
    const avgViews = Math.round(totalViews / videos.length);

    // Engagement Rate: (Avg Likes + Avg Comments) / Subscribers (or Views if subscribers hidden)
    let engagementRate = 0;
    if (subscriberCount > 0) {
        engagementRate = parseFloat((((avgLikes + avgComments) / subscriberCount) * 100).toFixed(2));
    } else if (avgViews > 0) {
        engagementRate = parseFloat((((avgLikes + avgComments) / avgViews) * 100).toFixed(2));
    }

    // Posting Frequency (posts per week)
    let postsPerWeek = 0;
    if (videos.length >= 2) {
        const newest = new Date(videos[0].timestamp).getTime();
        const oldest = new Date(videos[videos.length - 1].timestamp).getTime();
        const days = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
        postsPerWeek = parseFloat(((videos.length / days) * 7).toFixed(1));
    }

    // Engagement Trend (chronological order)
    const engagementTrend = videos
        .slice(-8)
        .reverse()
        .map((v) => v.engagement || 0);

    return {
        engagementRate,
        avgLikes,
        avgComments,
        avgViews,
        postsPerWeek,
        shortsCount,
        videosCount,
        engagementTrend,
    };
};

module.exports = {
    id: "youtube",
    name: "YouTube",
    implemented: true,
    source: "YouTube Data API v3",
    envVars: ["YOUTUBE_API_KEY"],
    searchHint: "YouTube channel handle, name or link, e.g. @mkbhd, @mrbeast, or youtube.com/@amul_india",
    metrics: ["subscribers", "views", "likes", "comments", "upload frequency", "Shorts vs Long videos", "video tags"],
    notAvailable: ["retention graph", "monetization revenue", "CTR for competitor channels"],
    dataNote: "YouTube statistics are public and updated in real-time. Views, likes, comments and Shorts are analyzed directly via YouTube Data API v3.",

    /** Quick check for search box -> profile card with stats and recent videos */
    lookup: async (input, opts = {}) => {
        const key = getApiKey();
        const channelItem = await fetchChannelDetails(input, key);
        const snippet = channelItem.snippet || {};
        const stats = channelItem.statistics || {};
        const uploadsId = channelItem.contentDetails?.relatedPlaylists?.uploads;

        const limit = opts.mediaLimit || 12;
        const recentPosts = await fetchRecentVideos(uploadsId, limit, key);
        const computed = computeYouTubeStats(recentPosts, parseInt(stats.subscriberCount || 0, 10));

        const handle = snippet.customUrl ? snippet.customUrl.replace(/^@/, "") : snippet.title;

        return {
            username: handle,
            name: snippet.title || handle,
            profilePictureUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
            biography: snippet.description || "",
            website: `https://www.youtube.com/${snippet.customUrl || `channel/${channelItem.id}`}`,
            followers: parseInt(stats.subscriberCount || 0, 10),
            mediaCount: parseInt(stats.videoCount || 0, 10),
            totalViews: parseInt(stats.viewCount || 0, 10),
            engagementRate: computed.engagementRate,
            postsPerWeek: computed.postsPerWeek,
            engagementTrend: computed.engagementTrend,
            stats: computed,
            recentPosts,
        };
    },

    /** Full data for the competitor report */
    fetchAccount: async (input, opts = {}) => {
        const key = getApiKey();
        const channelItem = await fetchChannelDetails(input, key);
        const snippet = channelItem.snippet || {};
        const stats = channelItem.statistics || {};
        const uploadsId = channelItem.contentDetails?.relatedPlaylists?.uploads;

        const limit = opts.mediaLimit || MEDIA_LIMIT;
        const recentPosts = await fetchRecentVideos(uploadsId, limit, key);
        const computed = computeYouTubeStats(recentPosts, parseInt(stats.subscriberCount || 0, 10));
        const handle = snippet.customUrl ? snippet.customUrl.replace(/^@/, "") : snippet.title;

        return {
            profile: {
                id: channelItem.id,
                username: handle,
                name: snippet.title || handle,
                profilePictureUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || null,
                biography: snippet.description || "",
                website: `https://www.youtube.com/${snippet.customUrl || `channel/${channelItem.id}`}`,
                followers: parseInt(stats.subscriberCount || 0, 10),
                mediaCount: parseInt(stats.videoCount || 0, 10),
                totalViews: parseInt(stats.viewCount || 0, 10),
            },
            stats: computed,
            recentPosts,
            source: "YouTube Data API v3",
            fetchedAt: new Date().toISOString(),
        };
    },

    /** Your own channel (for "you vs them") */
    fetchMine: async (opts = {}) => {
        const { getAccountCredentials } = require("../../tokenService.js");
        const creds = await getAccountCredentials({ ...opts, platform: "youtube" });
        const ref = creds?.accountId || creds?.username || process.env.YOUTUBE_CHANNEL_HANDLE || process.env.YOUTUBE_CHANNEL_ID;
        if (!ref) return null;
        return module.exports.fetchAccount(ref, opts);
    },
};
