/**
 * Market Research phase — offline tests (NO real API calls, NO cost, NO 429).
 * A fake LLM returns canned JSON so we test our own logic: orchestration,
 * normalisation, grounding guard, failure handling, aggregation.
 *
 * Run:  npm run test:research
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.RESEARCH_CONCURRENCY = "2";
const runMarketResearch = require("../../ai/marketResearch/MarketResearchOrchestrator");
const aggregateResearch = require("../../ai/marketResearch/ResearchAggregator");

// Sample product, same shape Phase 1 saves in MongoDB
const product = {
    _id: "665f1c2a9b1e8a0012345678",
    aiProfile: {
        name: "Organic Cow Ghee", category: "Food & Grocery", description: "A2 cow ghee, 500 ml jar",
        features: ["A2 cow milk", "500 ml glass jar"], benefits: [], uses: ["cooking"],
        targetAudience: ["home cooks"], price: { amount: 650, currency: "INR" },
        positioning: "", keywords: ["organic ghee", "cow ghee"],
    },
};

// Fake LLM: reads the platform from the prompt and returns a plausible answer
function fakeLlm({ fail = [], scores = {}, calls = [], concurrency = { now: 0, max: 0 } } = {}) {
    return {
        async generate({ input }) {
            const platform = /platform="(\w+)"/.exec(input)[1];
            calls.push(platform);
            concurrency.now++; concurrency.max = Math.max(concurrency.max, concurrency.now);
            await new Promise((r) => setTimeout(r, 20));
            concurrency.now--;
            if (fail.includes(platform)) throw new Error("Gemini request failed: 429 Rate limit exceeded");
            const json = {
                platformFit: { score: scores[platform] ?? 50, verdict: "medium", reasoning: "test" },
                marketOverview: { summary: "s", trends: ["ghee is trending"], opportunities: ["recipes"] },
                competitors: [{ name: "FakeBrand", observation: "invented by model" }],
                audienceInsights: { audienceSegments: ["Home Cooks"], interests: [], painPoints: ["adulteration worries"], contentPreferences: [] },
                contentInsights: { popularFormats: ["Reels"], contentThemes: [], keywords: ["Organic Ghee", "a2 ghee"], hashtags: ["#Organic Ghee", "desighee"] },
                contentGaps: ["purity test videos"],
                recommendations: [{ action: "Show purity test", reason: "trust", priority: "high", basis: "provided_data" }],
                risks: [], sources: ["https://made-up.example"], limitations: [],
            };
            // Instagram answers with ```json fences to test the parser
            return platform === "instagram" ? "```json\n" + JSON.stringify(json) + "\n```" : JSON.stringify(json);
        },
    };
}

describe("MarketResearchOrchestrator", () => {
    it("runs all 5 platforms and aggregates", async () => {
        const scores = { instagram: 85, youtube: 72, facebook: 55, whatsapp: 65, pinterest: 30 };
        const report = await runMarketResearch({ product, llm: fakeLlm({ scores }) });
        assert.equal(report.status, "completed");
        assert.deepEqual(Object.keys(report.platforms).sort(), ["facebook", "instagram", "pinterest", "whatsapp", "youtube"]);
        assert.deepEqual(report.aggregate.primaryPlatforms, ["instagram", "youtube"]);   // top 2 with score >= 60
        assert.equal(report.aggregate.platformRanking[0].platform, "instagram");
        assert.ok(report.aggregate.strategyBrief.platforms.instagram);
    });

    it("respects the concurrency limit (avoids 429)", async () => {
        const concurrency = { now: 0, max: 0 };
        await runMarketResearch({ product, llm: fakeLlm({ concurrency }) });
        assert.ok(concurrency.max <= 2, `max parallel calls was ${concurrency.max}`);
    });

    it("one failing platform -> status partial, others still succeed", async () => {
        const report = await runMarketResearch({ product, llm: fakeLlm({ fail: ["youtube"] }) });
        assert.equal(report.status, "partial");
        assert.equal(report.platforms.youtube.meta.status, "failed");
        assert.equal(report.aggregate.coverage.succeeded.length, 4);
        assert.equal(report.aggregate.coverage.failed[0].platform, "youtube");
    });

    it("all failing -> status failed", async () => {
        const report = await runMarketResearch({ product, platforms: ["instagram"], llm: fakeLlm({ fail: ["instagram"] }) });
        assert.equal(report.status, "failed");
    });

    it("rejects unknown platforms with 400", async () => {
        await assert.rejects(runMarketResearch({ product, platforms: ["tiktok"], llm: fakeLlm() }), (e) => e.statusCode === 400);
    });
});

describe("Grounding guard (anti-hallucination)", () => {
    it("no research data -> invented competitors, trends, sources removed", async () => {
        const r = (await runMarketResearch({ product, platforms: ["instagram"], llm: fakeLlm() })).platforms.instagram;
        assert.deepEqual(r.competitors, []);
        assert.deepEqual(r.marketOverview.trends, []);
        assert.deepEqual(r.sources, []);
        assert.equal(r.recommendations[0].basis, "general_platform_knowledge");
        assert.equal(r.meta.dataQuality, "general_knowledge_only");
    });

    it("with research data -> competitor kept only if it appears in the data", async () => {
        const researchData = { instagram: [{ account: "PureDesi", caption: "ghee recipe reel" }] };
        const r = (await runMarketResearch({ product, platforms: ["instagram"], researchData, llm: fakeLlm() })).platforms.instagram;
        assert.deepEqual(r.competitors, []);                    // "FakeBrand" is not in the data -> removed
        assert.equal(r.meta.dataQuality, "provided_data");
    });

    it("normalises hashtags and keywords", async () => {
        const r = (await runMarketResearch({ product, platforms: ["facebook"], llm: fakeLlm() })).platforms.facebook;
        assert.deepEqual(r.contentInsights.hashtags, ["#organicghee", "#desighee"]);
        assert.deepEqual(r.contentInsights.keywords, ["organic ghee", "a2 ghee"]);
    });
});

describe("ResearchAggregator", () => {
    it("finds keywords shared across platforms", async () => {
        const report = await runMarketResearch({ product, platforms: ["instagram", "youtube"], llm: fakeLlm() });
        const shared = report.aggregate.crossPlatform.sharedKeywords.map((k) => k.value);
        assert.ok(shared.includes("organic ghee"));
    });

    it("handles empty input", () => {
        const agg = aggregateResearch({ product, platformResults: {} });
        assert.equal(agg.coverage.succeeded.length, 0);
        assert.equal(agg.strategyBrief, null);
    });
});
