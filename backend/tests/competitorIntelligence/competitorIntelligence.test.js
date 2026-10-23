// node --test tests/competitorIntelligence/competitorIntelligence.test.js
// Multi-agent pipeline on fake (but realistic) Instagram data — no network, no LLM, no MongoDB.
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

process.env.LLM_PROVIDER = "none_for_tests"; // any LLM call fails fast -> code fallback
delete process.env.INSTAGRAM_ACCESS_TOKEN;

const { loadSkills, getSkill } = require("../../ai/competitorIntelligence/skillLoader.js");
const { analyzeAccount, compareAccounts, allRealHashtags } = require("../../services/competitors/competitorAnalysis.js");
const { runPostAnalysis } = require("../../services/competitorIntelligence/agents/postAnalysisAgent.js");
const { runCommentAnalysis, classifyComment } = require("../../services/competitorIntelligence/agents/commentAnalysisAgent.js");
const { runPerformance } = require("../../services/competitorIntelligence/agents/performanceAgent.js");
const { runContentGap } = require("../../services/competitorIntelligence/agents/contentGapAgent.js");
const { runOpportunity } = require("../../services/competitorIntelligence/agents/opportunityAgent.js");
const { runStrategy } = require("../../services/competitorIntelligence/agents/strategyAgent.js");
const { fallbackIdeas } = require("../../services/competitorIntelligence/agents/ideationAgent.js");
const { runBriefs } = require("../../services/competitorIntelligence/agents/briefAgent.js");
const { runQualityCheck } = require("../../services/competitorIntelligence/agents/qualityAgent.js");
const { runResults } = require("../../services/competitorIntelligence/agents/resultsAgent.js");
const { scoreCandidate, brandWords } = require("../../services/competitorIntelligence/discoveryService.js");

const { brand, raw, meRaw, ownComments } = require("./fixtures.js");

describe("skill files", () => {
    it("every agent has an md skill with a valid JSON config", () => {
        const { list } = loadSkills();
        assert.ok(list.length >= 15);
        for (const id of ["post_analysis", "comment_analysis", "competitor_performance", "content_gap", "content_opportunity", "content_strategy", "content_ideation", "content_brief", "quality_check"]) {
            assert.ok(getSkill(id).file, `skill for ${id}`);
            assert.equal(typeof getSkill(id).config, "object");
        }
        assert.ok(getSkill("post_analysis").config.themes["Educational"].length > 3);
        assert.ok(getSkill("content_strategy").llmRules.includes("ONLY"));
    });
});

describe("agent chain (no LLM)", () => {
    let accounts, me, posts, meRows, audience, performance, comparison, gaps, opp, strategy, ideas, briefs, quality, realTags;
    before(() => {
        accounts = raw.map(analyzeAccount);
        me = analyzeAccount(meRaw);
        posts = runPostAnalysis({ rawAccounts: raw, brand });
        meRows = runPostAnalysis({ rawAccounts: [meRaw], brand }).rows;
        audience = runCommentAnalysis({ ownComments, postRows: posts.rows, meRows });
        comparison = compareAccounts(accounts, me);
        performance = runPerformance({ accounts, me, rows: posts.rows, meRows });
        gaps = runContentGap({ posts, audience, performance, comparison, me, meRows }).gaps;
        opp = runOpportunity({ gaps, posts, brand });
        strategy = runStrategy({ brand, posts, performance, opportunities: opp.opportunities, comparison, audience });
        ideas = fallbackIdeas({ brand, opportunities: opp.opportunities, strategy });
        briefs = runBriefs({ ideas, opportunities: opp.opportunities, strategy, posts, gaps, brand });
        realTags = allRealHashtags(accounts, me);
        quality = runQualityCheck({ briefs, realTags, competitorNames: accounts.flatMap((a) => [a.profile.username, a.profile.name]) });
    });

    it("post analysis tags themes, formats, hooks and a 7×8 heatmap", () => {
        assert.equal(posts.totals.posts, 56);
        assert.ok(posts.themes.some((t) => t.key === "Educational"));
        assert.ok(posts.themes.some((t) => t.key === "Product"), "brand keywords become the Product theme");
        assert.equal(posts.formats[0].key, "reel", "reels were boosted in the fixture");
        assert.equal(posts.heatmap.cells.length, 7);
        assert.equal(posts.heatmap.cells[0].length, 8);
        assert.ok(posts.rows.every((r) => r.pi == null || r.pi > 0));
        const mixSum = Object.values(posts.formatMix[0].mix).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(mixSum - 100) <= 2);
    });

    it("comment analysis: sentiment, intents, questions; competitor conversation", () => {
        assert.equal(audience.own.total, 7);
        assert.ok(audience.own.intents.find((i) => i.intent === "Purchase intent").count >= 3);
        assert.ok(audience.own.sentiment.negative >= 1 && audience.own.sentiment.positive >= 1);
        assert.ok(audience.own.questions.length >= 2);
        assert.equal(audience.competitors.byAccount.length, 4);
        assert.ok(audience.competitors.question.lift > 1, "question captions got more comments in the fixture");
        assert.deepEqual(classifyComment("worst order, refund please", getSkill("comment_analysis").config).sentiment, "negative");
    });

    it("performance: scores 0-100, ranks, tiers, you included", () => {
        assert.equal(performance.accounts.length, 4);
        performance.accounts.forEach((a) => assert.ok(a.score >= 0 && a.score <= 100));
        assert.equal(performance.accounts[0].rank, 1);
        assert.equal(performance.accounts[0].tier, "Leader");
        assert.ok(performance.you && performance.you.isYou);
    });

    it("gaps and opportunities carry evidence and scores", () => {
        assert.ok(gaps.length >= 3);
        gaps.forEach((g) => { assert.ok(g.evidence); assert.ok(g.score >= 0 && g.score <= 100); });
        assert.ok(gaps.some((g) => g.type === "audience"), "purchase-intent comments become a gap");
        assert.ok(opp.opportunities.length >= 3);
        assert.deepEqual(opp.opportunities.map((o) => o.rank), opp.opportunities.map((_, i) => i + 1));
        for (let i = 1; i < opp.opportunities.length; i++) assert.ok(opp.opportunities[i - 1].score >= opp.opportunities[i].score);
    });

    it("strategy: mixes sum to 100, calendar matches cadence, real hashtags", () => {
        assert.equal(strategy.formatMix.reduce((n, f) => n + f.pct, 0) <= 100, true);
        assert.equal(strategy.pillars.reduce((n, p) => n + p.pct, 0), 100);
        assert.equal(strategy.calendar.length, strategy.cadence.postsPerWeek);
        [...strategy.hashtagSets.core, ...strategy.hashtagSets.niche].forEach((h) => assert.ok(realTags.has(h), h));
        assert.ok(strategy.positioning.includes("Ycoo Coffee"));
    });

    it("ideas -> briefs -> quality check", () => {
        assert.ok(ideas.length >= 3);
        assert.equal(briefs.length, ideas.length);
        briefs.forEach((b) => { assert.ok(b.structure.length); assert.ok(b.hook); assert.ok(b.slot); });
        assert.equal(quality.results.length, briefs.length);
        quality.results.forEach((r) => assert.ok(r.checks.find((c) => c.key === "groundedHashtags").pass));
        const bad = runQualityCheck({ briefs: [{ ...briefs[0], hashtags: ["#madeup123"], hook: "Better than @brew_one" }], realTags, competitorNames: ["brew_one"] });
        assert.equal(bad.results[0].checks.find((c) => c.key === "groundedHashtags").pass, false);
        assert.equal(bad.results[0].checks.find((c) => c.key === "noCompetitorNames").pass, false);
    });

    it("results agent -> improvements vs KPIs", () => {
        const r = runResults({
            items: [{ ideaIndex: 0, idea: ideas[0], post: { status: "published" }, result: { likes: 10, comments: 0, insights: { saved: 5 } } }],
            strategy, followers: 3000,
        });
        assert.equal(r.summary.measured, 1);
        assert.ok(r.improvements.length >= 1);
    });

    it("discovery relevance score prefers on-brand accounts", () => {
        const bw = brandWords(brand);
        const weights = getSkill("competitor_discovery").config.weights;
        const onBrand = scoreCandidate(raw[0], { brand, bw, seedTags: ["coffee"], sources: ["#coffee", "AI suggestion"], weights });
        const offBrand = scoreCandidate({ profile: { username: "glam", followers: 9000, biography: "lipstick and nails" }, recentPosts: [{ caption: "new lipstick shade #makeup", hashtags: ["#makeup"], timestamp: new Date().toISOString() }] },
            { brand, bw, seedTags: ["coffee"], sources: ["AI suggestion"], weights });
        assert.ok(onBrand.score > offBrand.score + 20, `${onBrand.score} vs ${offBrand.score}`);
    });
});

describe("orchestrator (full run, fake provider, no DB)", () => {
    it("runs every agent, records progress and saves the result", async () => {
        const CompetitorResearch = require("../../models/CompetitorResearch.js");
        const saves = [];
        CompetitorResearch.updateOne = async (q, u) => { saves.push(u.$set); return { acknowledged: true }; };
        const { runPipeline } = require("../../services/competitorIntelligence/orchestrator.js");
        const { freshPipeline } = require("../../services/competitorIntelligence/agentRegistry.js");
        const provider = {
            id: "instagram", name: "Instagram", source: "fake",
            fetchAccount: async (u) => { const a = raw.find((x) => x.profile.username === u); if (!a) throw Object.assign(new Error("not found"), { statusCode: 404 }); return a; },
            fetchMine: async () => meRaw,
        };
        const pipeline = freshPipeline();
        await runPipeline("507f1f77bcf86cd799439011", { product: { aiProfile: brand }, provider, usernames: ["brew_one", "bean_co", "roast_lab", "cup_culture", "ghost_brand"], prompt: "", useAI: true, pipeline });
        const final = saves[saves.length - 1];
        assert.equal(final.status, "partial", "1 competitor failed + LLM unavailable -> partial");
        const st = (id) => final.pipeline.agents.find((a) => a.id === id).status;
        for (const id of ["orchestrator", "competitor_research", "data_collection", "post_analysis", "comment_analysis", "competitor_performance", "content_gap", "content_opportunity", "content_strategy", "content_ideation", "content_brief", "quality_check"]) assert.equal(st(id), "done", id);
        assert.equal(st("customer_approval"), "waiting");
        assert.equal(final.pipeline.agents.find((a) => a.id === "competitor_research").children.filter((c) => c.status === "failed").length, 1);
        assert.equal(final.pipeline.live.accounts.length, 4);
        assert.equal(final.data.accounts.length, 4);
        assert.ok(final.analysis.summary && final.analysis.contentIdeas.length, "code report replaces the failed LLM report");
        assert.equal(final.analysis.source, "code");
        assert.ok(final.intelligence.briefs.length && !final.intelligence.posts.rows, "rows are not saved");
        assert.ok(final.pipeline.agents.every((a) => a.status !== "running"));
    });
});
