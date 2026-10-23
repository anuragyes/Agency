// Instagram — LIVE. Business Discovery API (official): any Business / Creator account's
// profile + recent posts with likes and comments. Your own account via the Instagram Graph API.
// Limits: exact username only (no name search), no personal/private accounts,
// no shares / saves / reach for other accounts (Meta only gives those to the account owner).
const { getCompetitorAccount, getInstagramAccountOverview } = require("../../instagramInsightsService.js");

const MEDIA_LIMIT = Math.min(50, Number(process.env.COMPETITOR_MEDIA_LIMIT) || 30);


console.log("this is the ", MEDIA_LIMIT)
module.exports = {
    id: "instagram",
    name: "Instagram",
    implemented: true,
    source: "Instagram Graph API (Business Discovery)",
    envVars: ["META_ACCESS_TOKEN", "META_INSTAGRAM_USER_ID", "META_GRAPH_API_VERSION"],
    searchHint: "Exact Instagram username of a Business or Creator account, e.g. amul_india",
    metrics: ["followers", "likes", "comments", "posting frequency", "formats", "captions", "hashtags"],
    notAvailable: ["shares", "saves", "reach", "story data", "personal / private accounts"],

    /** Quick check for the search box -> one profile card with stats and posts */
    lookup: async (username) => {
        const a = await getCompetitorAccount(username, { mediaLimit: 12 });
        return {
            username: a.profile.username,
            name: a.profile.name,
            profilePictureUrl: a.profile.profilePictureUrl,
            biography: a.profile.biography,
            website: a.profile.website,
            followers: a.profile.followers,
            mediaCount: a.profile.mediaCount,
            engagementRate: a.stats.engagementRate,
            postsPerWeek: a.stats.postsPerWeek,
            engagementTrend: a.stats.engagementTrend,
            stats: a.stats,
            recentPosts: a.recentPosts.map(({ id, imageUrl, permalink, likes, comments, mediaType, caption, timestamp, engagement }) => ({
                id,
                imageUrl,
                permalink,
                likes,
                comments,
                mediaType,
                caption,
                timestamp,
                engagement,
            })),
        };
    },

    /** Full data for the report */
    fetchAccount: (username) => getCompetitorAccount(username, { mediaLimit: MEDIA_LIMIT }),

    /** Your own account (for "you vs them"). Returns null when it can't be read. */
    fetchMine: async () => getInstagramAccountOverview({ mediaLimit: MEDIA_LIMIT }),
};
