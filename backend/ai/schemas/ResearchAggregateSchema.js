// ─────────────────────────────────────────────────────────────
// ResearchAggregateSchema.js — shape of the FINAL aggregated report
// (output of the Research Aggregator, input of the Platform Strategy Orchestrator).
// The per-platform shape lives in ResearchSchema.js.
// ─────────────────────────────────────────────────────────────

const emptyAggregate = () => ({
    coverage: { requested: [], succeeded: [], failed: [] },           // which platform agents worked
    dataQuality: "general_knowledge_only",                            // "provided_data" | "mixed" | "general_knowledge_only"
    platformRanking: [],                                              // [{ platform, score, verdict, reasoning }] best first
    primaryPlatforms: [],                                             // the 1-2 platforms to focus on first
    crossPlatform: {
        sharedKeywords: [],                                           // keywords found on 2+ platforms = strongest signals
        sharedAudienceSegments: [],
        sharedPainPoints: [],
        hashtagsByPlatform: {},
        contentGaps: [],
    },
    topRecommendations: [],                                           // high-priority actions across all platforms
    risks: [],
    limitations: [],
    strategyBrief: null,                                              // compact hand-off for the next phase
});

module.exports = { emptyAggregate };
