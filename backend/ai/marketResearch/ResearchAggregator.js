// ─────────────────────────────────────────────────────────────
// ResearchAggregator.js — "Research Aggregator" box in the diagram.
// Takes the 5 platform results and merges them into ONE report + a compact
// "strategyBrief" that the next phase (Platform Strategy Orchestrator) will use.
//
// Design choice: this is plain JavaScript, NOT another LLM call.
//   + free and instant (no extra tokens, no extra 429 rate-limit risk)
//   + deterministic: same input -> same output (easy to test)
// ─────────────────────────────────────────────────────────────
const { emptyAggregate } = require("../schemas/ResearchAggregateSchema");
const { cleanList } = require("../schemas/ResearchSchema");

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIMARY_MIN_SCORE = 60;      // a platform needs at least this fit score to be "primary"
const MAX_PRIMARY = 2;             // focus beats spreading thin: max 2 primary platforms

// Helper: items that appear in at least `min` different platforms (case-insensitive)
function sharedAcross(listsByPlatform, min = 2) {
    const counts = new Map();                              // lowercased item -> { label, platforms:Set }
    for (const [platform, list] of Object.entries(listsByPlatform)) {
        for (const item of list || []) {
            const key = item.toLowerCase();
            if (!counts.has(key)) counts.set(key, { label: item, platforms: new Set() });
            counts.get(key).platforms.add(platform);
        }
    }
    return [...counts.values()]
        .filter((x) => x.platforms.size >= min)
        .sort((a, b) => b.platforms.size - a.platforms.size)
        .map((x) => ({ value: x.label, platforms: [...x.platforms] }));
}

// Helper: build {platform: value} from successful results
const byPlatform = (results, pick) => Object.fromEntries(results.map((r) => [r.platform, pick(r)]));

function aggregateResearch({ product = {}, platformResults = {}, requestedPlatforms = [] } = {}) {
    const report = emptyAggregate();
    const all = Object.values(platformResults);

    // STEP 1: Coverage — which agents succeeded / failed
    const ok = all.filter((r) => r?.meta?.status === "success");
    const failed = all.filter((r) => r?.meta?.status !== "success");
    report.coverage = {
        requested: requestedPlatforms.length ? requestedPlatforms : all.map((r) => r.platform),
        succeeded: ok.map((r) => r.platform),
        failed: failed.map((r) => ({ platform: r.platform, error: r?.meta?.error || "unknown error" })),
    };
    if (!ok.length) {
        report.limitations.push("All platform research agents failed — no insights available.");
        return report;
    }

    // STEP 2: Data quality — was the analysis based on real data or only general knowledge?
    const withData = ok.filter((r) => r.meta.dataQuality === "provided_data").length;
    report.dataQuality = withData === ok.length ? "provided_data" : withData > 0 ? "mixed" : "general_knowledge_only";

    // STEP 3: Rank platforms by fit score (best first)
    report.platformRanking = ok
        .map((r) => ({ platform: r.platform, ...r.platformFit }))
        .sort((a, b) => b.score - a.score);

    // STEP 4: Pick primary platforms (score >= 60, max 2). If none qualify, take the single best one.
    report.primaryPlatforms = report.platformRanking
        .filter((p) => p.score >= PRIMARY_MIN_SCORE)
        .slice(0, MAX_PRIMARY)
        .map((p) => p.platform);
    if (!report.primaryPlatforms.length && report.platformRanking[0]?.score > 0) {
        report.primaryPlatforms = [report.platformRanking[0].platform];
    }

    // STEP 5: Cross-platform signals — the same keyword/audience on 2+ platforms is a strong signal
    report.crossPlatform = {
        sharedKeywords: sharedAcross(byPlatform(ok, (r) => r.contentInsights.keywords)),
        sharedAudienceSegments: sharedAcross(byPlatform(ok, (r) => r.audienceInsights.audienceSegments)),
        sharedPainPoints: sharedAcross(byPlatform(ok, (r) => r.audienceInsights.painPoints)),
        hashtagsByPlatform: byPlatform(ok, (r) => r.contentInsights.hashtags),
        contentGaps: ok.flatMap((r) => r.contentGaps.map((gap) => ({ platform: r.platform, gap }))),
    };

    // STEP 6: Top recommendations — sort by priority, then by the platform's fit score
    const fitScore = Object.fromEntries(report.platformRanking.map((p) => [p.platform, p.score]));
    report.topRecommendations = ok
        .flatMap((r) => r.recommendations.map((rec) => ({ platform: r.platform, ...rec })))
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || fitScore[b.platform] - fitScore[a.platform])
        .slice(0, 12);

    // STEP 7: Risks + limitations (de-duplicated, tagged with platform)
    report.risks = ok.flatMap((r) => r.risks.map((risk) => ({ platform: r.platform, risk })));
    report.limitations = cleanList(all.flatMap((r) => r.limitations), 30);

    // STEP 8: strategyBrief — small, clean hand-off object for the Platform Strategy Orchestrator.
    // Strategy agents get only what they need -> shorter prompts, lower cost, less confusion.
    const p = product.aiProfile || product;
    report.strategyBrief = {
        product: {
            id: product._id ? String(product._id) : "",
            name: p.name || "", category: p.category || "",
            targetAudience: p.targetAudience || [], price: p.price || {}, positioning: p.positioning || "",
        },
        primaryPlatforms: report.primaryPlatforms,
        sharedKeywords: report.crossPlatform.sharedKeywords.map((k) => k.value).slice(0, 10),
        platforms: byPlatform(ok, (r) => ({
            fitScore: r.platformFit.score,
            verdict: r.platformFit.verdict,
            formats: r.contentInsights.popularFormats.slice(0, 5),
            themes: r.contentInsights.contentThemes.slice(0, 5),
            keywords: r.contentInsights.keywords.slice(0, 10),
            hashtags: r.contentInsights.hashtags.slice(0, 15),
            audience: r.audienceInsights.audienceSegments.slice(0, 5),
            painPoints: r.audienceInsights.painPoints.slice(0, 5),
            actions: r.recommendations.filter((x) => x.priority === "high").map((x) => x.action).slice(0, 5),
            risks: r.risks.slice(0, 5),
        })),
        dataQuality: report.dataQuality,
    };

    return report;
}

module.exports = aggregateResearch;
module.exports._internals = { sharedAcross, PRIMARY_MIN_SCORE, MAX_PRIMARY };
