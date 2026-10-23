// ─────────────────────────────────────────────────────────────
// providerContract.js — the shape every hashtag platform must follow.
//
// A provider is one social platform (Instagram, YouTube, TikTok ...).
// Only REAL platform API data is allowed here — no LLM, no guessed hashtags.
//
//   defineProvider({
//     id:          "youtube",                 // used in the URL: /api/hashtags/youtube/explore
//     name:        "YouTube",
//     source:      "YouTube Data API v3",     // shown in the UI as the data source
//     envVars:     ["YOUTUBE_API_KEY"],       // the provider is "configured" when all are set
//     apiDocs:     "https://...",
//     quotaNote:   "10,000 units per day",    // optional, shown as a tooltip
//     notes:       ["..."],                   // optional, implementation hints / limits
//
//     // Add these to make the platform LIVE (the UI enables it automatically):
//     explore: async ({ seeds }) => HashtagResult,           // "Find real hashtags"
//     quota:   async () => ({ used, limit, remaining }),     // optional
//     isConfigured: () => boolean,                           // optional (default: envVars check)
//   })
//
// HashtagResult (use buildHashtagResult.js to create it from your posts):
//   {
//     success: true, platform, mode: "explore", status: "success" | "partial",
//     seeds:   [{ hashtag, found, topPosts, recentPosts24h, avgTopPostEngagement, error?, note? }],
//     hashtags:[{ hashtag, score, posts, topPosts, recentPosts24h, avgLikes, avgComments, seenWith, isSeed }],
//     topPosts:    [Post], recentPosts: [Post],
//     mediaAnalyzed, quota, limitations: [string], source, fetchedAt
//   }
//   Post = { id, caption, hashtags: ["#x"], likes, comments, engagement, mediaType,
//            permalink, timestamp, imageUrl, username? }
// ─────────────────────────────────────────────────────────────

class HashtagApiError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.name = "HashtagApiError";
        this.statusCode = statusCode;
        if (code) this.code = code;
    }
}

const defineProvider = (spec) => {
    if (!spec?.id || !spec?.name) throw new Error("A hashtag provider needs an id and a name");

    const envVars = spec.envVars || [];
    const isConfigured = spec.isConfigured || (() => envVars.every((v) => Boolean(process.env[v])));
    const features = { explore: typeof spec.explore === "function", quota: typeof spec.quota === "function" };
    const implemented = features.explore;

    const notReady = (what) => async () => {
        throw new HashtagApiError(
            `${spec.name} ${what} is not connected yet. Add its real API in backend/services/hashtags/providers/${spec.id}.js.`,
            501,
            "PLATFORM_NOT_IMPLEMENTED"
        );
    };

    const run = (mode, fn) => async (args = {}) => {
        if (!isConfigured()) {
            throw new HashtagApiError(
                `${spec.name} API credentials are not configured${envVars.length ? ` (${envVars.join(", ")})` : ""}.`,
                503,
                "PLATFORM_NOT_CONFIGURED"
            );
        }
        const result = await fn(args);
        return { ...result, success: true, platform: spec.id, mode };
    };

    return {
        id: spec.id,
        name: spec.name,
        isConfigured,
        explore: features.explore ? run("explore", spec.explore) : notReady("hashtag search"),
        quota: features.quota ? spec.quota : async () => null,
        /** Public info for GET /api/hashtags/platforms (no secrets) */
        info: () => ({
            id: spec.id,
            name: spec.name,
            implemented,
            configured: implemented ? isConfigured() : false,
            features,
            source: spec.source || null,
            quotaNote: spec.quotaNote || null,
            apiDocs: spec.apiDocs || null,
            envVars,
            notes: spec.notes || [],
        }),
    };
};

module.exports = { defineProvider, HashtagApiError };
