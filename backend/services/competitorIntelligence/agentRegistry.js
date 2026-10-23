// ─────────────────────────────────────────────────────────────
// agentRegistry.js — the agents of the Competitor Intelligence pipeline, in run order.
// The frontend draws the agent graph from this list (deps = incoming edges).
// skill = the agent's instruction/config file in ai/competitorIntelligence/skills/
// ─────────────────────────────────────────────────────────────
const AGENTS = [
    { id: "orchestrator", name: "Orchestrator", group: "Coordinate", icon: "bot", skill: "orchestrator.md", engine: "code", deps: [] },
    { id: "competitor_research", name: "Competitor Research", group: "Research", icon: "search", skill: "competitor-research.md", engine: "api", deps: ["orchestrator"], fanOut: true },
    { id: "data_collection", name: "Data Collection", group: "Research", icon: "database", skill: "data-collection.md", engine: "api", deps: ["competitor_research"] },
    { id: "post_analysis", name: "Post Analysis", group: "Analyse", icon: "grid", skill: "post-analysis.md", engine: "code", deps: ["data_collection"] },
    { id: "comment_analysis", name: "Comment Analysis", group: "Analyse", icon: "message", skill: "comment-analysis.md", engine: "code", deps: ["data_collection"] },
    { id: "competitor_performance", name: "Competitor Performance", group: "Intelligence", icon: "chart", skill: "competitor-performance.md", engine: "code", deps: ["post_analysis", "comment_analysis"] },
    { id: "content_gap", name: "Content Gap", group: "Intelligence", icon: "scan", skill: "content-gap.md", engine: "code", deps: ["competitor_performance"] },
    { id: "content_opportunity", name: "Content Opportunity", group: "Intelligence", icon: "bulb", skill: "content-opportunity.md", engine: "code", deps: ["content_gap"] },
    { id: "content_strategy", name: "Content Strategy", group: "Strategy", icon: "target", skill: "content-strategy.md", engine: "code+llm", deps: ["content_opportunity"] },
    { id: "content_ideation", name: "Content Ideation", group: "Create", icon: "sparkles", skill: "content-ideation.md", engine: "code+llm", deps: ["content_strategy"] },
    { id: "content_brief", name: "Content Brief", group: "Create", icon: "file", skill: "content-brief.md", engine: "code", deps: ["content_ideation"] },
    { id: "quality_check", name: "Quality Check", group: "Create", icon: "shieldCheck", skill: "quality-check.md", engine: "code", deps: ["content_brief"] },
    { id: "customer_approval", name: "Customer Approval", group: "Approve", icon: "checkCircle", skill: "approval-publish.md", engine: "human", deps: ["quality_check"] },
    { id: "image_agent", name: "Image Agent", group: "Generate", icon: "image", skill: "creative-generation.md", engine: "studio", deps: ["customer_approval"] },
    { id: "video_agent", name: "Video Agent", group: "Generate", icon: "video", skill: "creative-generation.md", engine: "studio", deps: ["customer_approval"] },
    { id: "publish_schedule", name: "Publish / Schedule", group: "Publish", icon: "send", skill: "approval-publish.md", engine: "api", deps: ["image_agent", "video_agent"] },
    { id: "performance_analysis", name: "Performance Analysis", group: "Learn", icon: "trend", skill: "performance-analysis.md", engine: "api", deps: ["publish_schedule"] },
    { id: "strategy_improvement", name: "Strategy Improvement", group: "Learn", icon: "refresh", skill: "performance-analysis.md", engine: "code", deps: ["performance_analysis"] },
];

const freshPipeline = () => ({
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    current: null,
    agents: AGENTS.map(({ id, name, group, icon, engine, deps, fanOut }) => ({
        id, name, group, icon, engine, deps, fanOut: !!fanOut,
        status: "queued", progress: 0, message: "", startedAt: null, finishedAt: null, durationMs: null, metrics: {}, children: [],
    })),
    counters: { competitors: 0, competitorsDone: 0, posts: 0, comments: 0, apiCalls: 0, llmCalls: 0, llmTokens: 0 },
    live: { accounts: [] },
    log: [],
});

module.exports = { AGENTS, freshPipeline };
