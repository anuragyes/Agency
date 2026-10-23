// Facebook — LIVE (official Graph API). Your Page always works.
// Other Pages: Meta only allows reading them for apps approved for "Page Public Content Access"
// (Meta app review) — until then lookups return a clear 403 explaining that.
// Limits: no reach / impressions / saves for other Pages; "likes" = reactions.
const { getFacebookCompetitorPage, getFacebookPageOverview } = require("../../facebookInsightsService.js");

const MEDIA_LIMIT = Math.min(50, Number(process.env.COMPETITOR_MEDIA_LIMIT) || 30);

module.exports = {
    id: "facebook",
    name: "Facebook",
    implemented: true,
    source: "Facebook Graph API (Pages)",
    envVars: ["META_ACCESS_TOKEN", "META_PAGE_ID", "META_GRAPH_API_VERSION"],
    searchHint: "Facebook Page username, Page id or link, e.g. amul.coop or facebook.com/amul.coop",
    metrics: ["followers", "reactions", "comments", "shares", "posting frequency", "formats", "captions", "hashtags"],
    notAvailable: ["reach", "impressions", "saves", "personal profiles"],
    notes: ["Reading other Pages needs Meta's \"Page Public Content Access\" approval. Pages you manage work right away."],
    dataNote: "Facebook does not share reach or impressions for other Pages; \"likes\" here means all reactions.",

    lookup: async (ref) => {
        const a = await getFacebookCompetitorPage(ref, { postLimit: 9 });
        return {
            username: a.profile.username,
            name: a.profile.name,
            profilePictureUrl: a.profile.profilePictureUrl,
            biography: a.profile.biography,
            website: a.profile.website || a.profile.link,
            followers: a.profile.followers,
            mediaCount: a.recentPosts.length,
            engagementRate: a.stats.engagementRate,
            recentPosts: a.recentPosts.slice(0, 3).map(({ id, imageUrl, permalink, likes, comments, mediaType }) => ({ id, imageUrl, permalink, likes, comments, mediaType })),
        };
    },

    fetchAccount: (ref) => getFacebookCompetitorPage(ref, { postLimit: MEDIA_LIMIT }),

    fetchMine: () => getFacebookPageOverview({ postLimit: MEDIA_LIMIT }),
};
