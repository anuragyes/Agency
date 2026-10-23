// Facebook — LIVE, but from YOUR Page only. The Graph API has no public hashtag / post search for Facebook,
// so "Find real hashtags" reads your Page's recent posts, keeps the ones that mention each seed,
// and ranks the hashtags used in them (same ranking as Instagram, buildHashtagResult.js). No LLM.
const { defineProvider } = require("../providerContract.js");
const { buildHashtagResult } = require("../buildHashtagResult.js");
const { normalizeHashtag } = require("../../instagramService.js");
const { isFacebookConfigured } = require("../../facebookService.js");
const { getFacebookPageOverview } = require("../../facebookInsightsService.js");

const POSTS_TO_READ = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const explore = async ({ seeds: rawSeeds = [] } = {}) => {
    const seeds = [...new Set((Array.isArray(rawSeeds) ? rawSeeds : [rawSeeds]).map(normalizeHashtag).filter(Boolean))].slice(0, 10);
    if (!seeds.length) throw Object.assign(new Error("Add at least one hashtag or keyword"), { statusCode: 400 });

    const page = await getFacebookPageOverview({ postLimit: POSTS_TO_READ });
    const posts = page.recentPosts || [];
    const groups = [];
    const seedStats = [];

    for (const seed of seeds) {
        const word = seed.toLowerCase();
        const matches = posts.filter((p) => {
            const text = String(p.caption || "").toLowerCase().replace(/\s+/g, "");
            return text.includes(word) || (p.hashtags || []).some((h) => normalizeHashtag(h) === word);
        });
        const top = [...matches].sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1)).slice(0, 25);
        const recent = matches.filter((p) => p.timestamp && Date.now() - new Date(p.timestamp).getTime() <= DAY_MS);
        groups.push({ seed, edge: "top", posts: top }, { seed, edge: "recent", posts: recent });
        const eng = top.filter((p) => p.engagement != null);
        seedStats.push({
            hashtag: `#${seed}`,
            found: matches.length > 0,
            topPosts: top.length,
            recentPosts24h: recent.length,
            avgTopPostEngagement: eng.length ? Math.round(eng.reduce((a, p) => a + p.engagement, 0) / eng.length) : null,
            ...(!matches.length && { note: `None of your last ${posts.length} Page posts mention "${seed}".` }),
        });
    }

    return buildHashtagResult({
        source: `Facebook Graph API — your Page (${page.profile?.name || "Page"}), last ${posts.length} posts`,
        seeds,
        seedStats,
        groups,
        limitations: [
            "Facebook has no public hashtag search: these hashtags come from YOUR Page's own recent posts.",
            "\"Likes\" = all reactions. Shares are counted in engagement on the Accounts page.",
        ],
    });
};

module.exports = defineProvider({
    id: "facebook",
    name: "Facebook",
    source: "Facebook Graph API (your Page)",
    envVars: ["META_ACCESS_TOKEN", "META_PAGE_ID"],
    apiDocs: "https://developers.facebook.com/docs/graph-api/reference/page/feed",
    quotaNote: "No weekly hashtag limit — reads your own Page posts.",
    isConfigured: isFacebookConfigured,
    notes: [
        "The Graph API does not offer a public hashtag search for Facebook posts.",
        "Results come from hashtags in your own Page posts, ranked with buildHashtagResult().",
    ],
    explore,
});
