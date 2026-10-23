// ─────────────────────────────────────────────────────────────
// FacebookBriefResearch.js — Studio STEP 5 for Facebook. NO LLM, 0 tokens.
// Facebook has no public hashtag / post search, so the researcher reads what is real and allowed:
// YOUR Page's recent posts (Graph API) -> best posts, best formats, hashtags you already use,
// and the posts that mention the brief's important words.
// Same top-level shape as the Instagram research (hashtags[], mediaAnalyzed, status ...).
// ─────────────────────────────────────────────────────────────
const { getFacebookPageOverview } = require("../../../../services/facebookInsightsService.js");
const { analyzeAccount } = require("../../../../services/competitors/competitorAnalysis.js");

const POSTS_TO_READ = 50;
const firstLine = (s) => String(s || "").split("\n").map((l) => l.trim()).find(Boolean) || "";

const researchFacebookFromBrief = async ({ brief, overview: given } = {}) => {
    if (!brief || typeof brief !== "object") throw new Error("brief is required");
    const words = [...(brief.importantWords || []), ...(brief.keywords || [])].map((w) => String(w).toLowerCase().trim()).filter((w) => w.length > 2);

    let overview = given;
    try {
        if (!overview) overview = await getFacebookPageOverview({ postLimit: POSTS_TO_READ });
    } catch (err) {
        return {
            mode: "brief", platform: "facebook", source: "facebook_graph_api", status: "unavailable",
            fetchedAt: new Date().toISOString(), mediaAnalyzed: 0, hashtags: [], topPosts: [], formats: [], relatedPosts: [],
            error: err.message, limitations: ["Your Facebook Page could not be read, so the post is written from your brief only."],
        };
    }

    const posts = overview.recentPosts || [];
    const a = posts.length ? analyzeAccount(overview) : null;
    const scored = posts.filter((p) => p.engagement != null).sort((x, y) => y.engagement - x.engagement);
    const fmt = (p) => (p.productType === "REELS" ? "reel" : p.mediaType === "CAROUSEL_ALBUM" ? "album" : p.mediaType === "VIDEO" ? "video" : p.mediaType === "TEXT" ? "text" : "photo");
    const related = words.length ? posts.filter((p) => words.some((w) => p.caption.toLowerCase().includes(w))) : [];

    return {
        mode: "brief",
        platform: "facebook",
        source: "facebook_graph_api",
        status: posts.length ? "success" : "unavailable",
        fetchedAt: overview.fetchedAt || new Date().toISOString(),
        page: { name: overview.profile?.name, followers: overview.profile?.followers },
        mediaAnalyzed: posts.length,
        hashtags: (overview.stats?.topHashtags || []).slice(0, 20).map(({ hashtag, posts: n, avgEngagement }) => ({ hashtag, posts: n, avgEngagement })),
        topPosts: scored.slice(0, 5).map((p) => ({ hook: firstLine(p.caption).slice(0, 140), format: fmt(p), engagement: p.engagement, permalink: p.permalink })),
        formats: (a?.formats || []).map((f) => ({ format: f.key, posts: f.posts, avgEngagement: f.avgEngagement })),
        relatedPosts: related.slice(0, 5).map((p) => ({ hook: firstLine(p.caption).slice(0, 140), engagement: p.engagement, permalink: p.permalink })),
        engagementRate: overview.stats?.engagementRate ?? null,
        limitations: [
            "Facebook has no public hashtag or post search — this research uses your own Page's recent posts.",
            ...(posts.length ? [] : ["Your Page has no posts we could read yet, so the post is written from your brief."]),
        ],
    };
};

module.exports = researchFacebookFromBrief;
