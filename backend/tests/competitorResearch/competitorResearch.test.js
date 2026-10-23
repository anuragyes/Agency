// node --test tests/competitorResearch/competitorResearch.test.js — analysis + grounded report (no network, fake LLM)
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeAccount, compareAccounts } = require("../../services/competitors/competitorAnalysis.js");
const { generateCompetitorReport } = require("../../ai/competitorResearch/CompetitorReportAgent.js");
const { buildPostResearch } = require("../../services/competitors/competitorResearchService.js");
const { listPlatforms, getProvider } = require("../../services/competitors");

const post = (id, { likes, comments, type = "IMAGE", product = "FEED", day, caption }) => ({
    id, likes, comments, engagement: likes + comments, mediaType: type, productType: product,
    timestamp: day, caption, hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()),
    permalink: `https://instagram.com/p/${id}`, imageUrl: null,
});

const brandA = {
    profile: { username: "brand_a", name: "Brand A", followers: 10000, biography: "Pure ghee since 1990" },
    recentPosts: [
        post("a1", { likes: 900, comments: 50, type: "VIDEO", product: "REELS", day: "2026-10-01T06:00:00Z", caption: "How we make it? Watch! #desighee #a2ghee #fyp" }),
        post("a2", { likes: 700, comments: 30, type: "VIDEO", product: "REELS", day: "2026-09-28T06:30:00Z", caption: "Recipe time 🍲 link in bio #desighee #recipe" }),
        post("a3", { likes: 100, comments: 5, day: "2026-09-24T12:00:00Z", caption: "New pack #desighee" }),
        post("a4", { likes: 120, comments: 4, day: "2026-09-21T12:00:00Z", caption: "Offer today #a2ghee" }),
    ],
};
const brandB = {
    profile: { username: "brand_b", name: "Brand B", followers: 5000 },
    recentPosts: [
        post("b1", { likes: 300, comments: 40, type: "CAROUSEL_ALBUM", day: "2026-10-02T06:00:00Z", caption: "5 benefits of ghee #desighee #healthyfood" }),
        post("b2", { likes: 250, comments: 20, type: "CAROUSEL_ALBUM", day: "2026-09-25T06:00:00Z", caption: "Ghee vs butter #healthyfood #a2ghee" }),
    ],
};
const mine = {
    profile: { username: "me", followers: 2000 },
    recentPosts: [
        post("m1", { likes: 40, comments: 2, day: "2026-09-30T10:00:00Z", caption: "Our ghee #gheelove" }),
        post("m2", { likes: 30, comments: 1, day: "2026-09-16T10:00:00Z", caption: "Try it #gheelove" }),
    ],
};

describe("competitorAnalysis (real numbers, no AI)", () => {
    const a = analyzeAccount(brandA);
    const b = analyzeAccount(brandB);
    const me = analyzeAccount(mine);
    const cmp = compareAccounts([a, b], me);

    it("engagement + formats", () => {
        assert.equal(a.postsAnalyzed, 4);
        assert.equal(a.avgEngagement, Math.round((950 + 730 + 105 + 124) / 4));
        assert.equal(a.engagementRate, Math.round((a.avgEngagement / 10000) * 10000) / 100);
        assert.equal(a.bestFormat, "reel");
        assert.equal(b.bestFormat, "carousel");
    });

    it("caption + hashtag stats, spam tags ignored", () => {
        assert.equal(a.captions.withQuestion, 25);
        assert.ok(a.captions.withCallToAction >= 25);
        assert.ok(!a.hashtags.some((h) => h.hashtag === "#fyp"));
        assert.equal(a.hashtags[0].hashtag, "#desighee");
    });

    it("hashtag gap = tags competitors use that you don't", () => {
        const gap = cmp.hashtagGap.map((h) => h.hashtag);
        assert.ok(gap.includes("#desighee"));
        assert.ok(gap.includes("#a2ghee"));
        assert.ok(!gap.includes("#gheelove"));
        assert.equal(cmp.hashtagGap.find((h) => h.hashtag === "#desighee").competitorsUsing, 2);
        assert.deepEqual(cmp.yourOnlyHashtags.map((h) => h.hashtag), ["#gheelove"]);
    });

    it("competitor brand hashtags are left out of the gap", () => {
        const amul = analyzeAccount({ profile: { username: "amul_india", name: "Amul", followers: 100 }, recentPosts: [
            post("x1", { likes: 10, comments: 1, day: "2026-10-01T06:00:00Z", caption: "#amul #desighee" }),
            post("x2", { likes: 12, comments: 1, day: "2026-10-02T06:00:00Z", caption: "#amul #amulbutter #desighee" }),
        ] });
        const gap = compareAccounts([amul], null).hashtagGap.map((h) => h.hashtag);
        assert.deepEqual(gap, ["#desighee"]);
    });

    it("benchmark + leader + format gap", () => {
        assert.equal(cmp.leader.username, "brand_b"); // higher engagement rate
        assert.ok(cmp.benchmark.me.avgEngagement < cmp.benchmark.competitors.avgEngagement);
        const reel = cmp.formatGap.find((f) => f.format === "reel");
        assert.equal(reel.yourShare, 0);
        assert.ok(cmp.topPosts[0].engagement >= cmp.topPosts[1].engagement);
    });

    it("AI report keeps only real hashtags + known usernames", async () => {
        const fakeLlm = {
            lastUsage: { prompt_tokens: 10, completion_tokens: 5 },
            generate: async ({ input }) => {
                assert.match(input, /brand_a/);
                return JSON.stringify({
                    summary: "Brand B leads on engagement rate.",
                    competitorInsights: [{ username: "@brand_a", strengths: ["Reels"], weaknesses: ["Few carousels"] }, { username: "ghost", strengths: ["x"] }],
                    captionInsights: ["Questions in captions"],
                    gaps: [{ title: "No reels from you", detail: "d", evidence: "brand_a reels avg 840" }, { title: "no evidence", detail: "x" }],
                    hashtagPlan: { use: ["#desighee", "#madeup123", "a2ghee"], why: "used by both" },
                    contentIdeas: [{ title: "Recipe reel", format: "Reel", hook: "h", angle: "a", hashtags: ["#recipe", "#fake"], basedOn: "a2" }],
                    actions: [{ action: "Post reels", priority: "low", evidence: "e" }, { action: "Use #desighee", priority: "high", evidence: "e" }],
                });
            },
        };
        const r = await generateCompetitorReport({ product: { name: "My Ghee" }, goal: "sell more", competitors: [a, b], me, comparison: cmp, llm: fakeLlm });
        assert.deepEqual(r.hashtagPlan.use, ["#desighee", "#a2ghee"]);
        assert.deepEqual(r.contentIdeas[0].hashtags, ["#recipe"]);
        assert.equal(r.contentIdeas[0].format, "reel");
        assert.equal(r.grounding.removedHashtags, 2);
        assert.deepEqual(r.competitorInsights.map((c) => c.username), ["brand_a"]);
        assert.equal(r.gaps.length, 1); // gap without evidence removed
        assert.equal(r.actions[0].priority, "high");
    });

    it("post research for the Studio pipeline uses real competitor hashtags", () => {
        const pr = buildPostResearch({ hashtagPlan: { use: ["#desighee"] } }, cmp, "instagram");
        assert.equal(pr.hashtags[0].hashtag, "#desighee");
        assert.ok(Array.isArray(pr.hashtags) && pr.hashtags.length >= 2);
    });
});

describe("platforms", () => {
    it("Instagram live, others not yet", () => {
        const list = listPlatforms();
        assert.equal(list[0].id, "instagram");
        assert.equal(list[0].implemented, true);
        assert.ok(list.filter((p) => !p.implemented).length >= 5);
        assert.throws(() => getProvider("youtube"), (e) => e.statusCode === 501);
    });
});
