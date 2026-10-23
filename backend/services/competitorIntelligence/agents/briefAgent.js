// ─────────────────────────────────────────────────────────────
// Content Brief Agent (skill: content-brief.md) — NO LLM
// idea + opportunity + strategy + real reference posts -> production-ready creative brief
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");

const OBJECTIVE = {
    theme: "Own an under-served content theme", format: "Win reach with a format competitors under-use", conversation: "Grow comments and saves",
    cta: "Turn engagement into clicks / DMs / orders", timing: "Publish when competition is low", hashtag: "Get discovered in the category hashtags",
    audience: "Answer what your audience is asking", frequency: "Build a consistent presence", hook: "Stop the scroll with a proven hook style",
};

const runBriefs = ({ ideas = [], opportunities = [], strategy = {}, posts = {}, gaps = [], brand = {} } = {}) => {
    const cfg = skillConfig("content_brief");
    const [minTags, maxTags] = cfg.hashtagsPerPost || [5, 12];
    const byId = new Map(opportunities.map((o) => [o.id, o]));
    const conversationGap = gaps.some((g) => g.type === "conversation");
    const bestLength = (posts.captionLength || []).find((b) => b.reliable)?.key || "Medium (60–200)";
    const pool = [...(strategy.hashtagSets?.core || []), ...(strategy.hashtagSets?.niche || [])];

    return ideas.map((idea, i) => {
        const opp = byId.get(idea.opportunityId) || {};
        const spec = cfg.formats?.[idea.format] || cfg.formats?.image || {};
        const tags = [...new Set([...(idea.hashtags || []), ...(opp.hashtags || []), ...pool])].slice(0, maxTags);
        const slot = opp.slot || strategy.slots?.[i % Math.max(1, strategy.slots?.length || 1)] || null;
        const refs = (posts.outliers || []).filter((p) => p.format === idea.format || p.themes?.includes(idea.pillar)).slice(0, 3)
            .map(({ username, permalink, multiple, format, hook }) => ({ username, permalink, multiple, format, hook }));
        return {
            id: `brief_${i + 1}`,
            ideaIndex: i,
            title: idea.title,
            objective: OBJECTIVE[opp.type] || "Grow engagement with original content",
            audience: (brand.targetAudience || []).slice(0, 3),
            pillar: idea.pillar,
            format: idea.format,
            spec: { ratio: spec.ratio, length: spec.length || null, slides: spec.slides || null },
            structure: [...(spec.structure || [])],
            hook: idea.hook,
            angle: idea.angle,
            caption: {
                length: bestLength,
                includeQuestion: conversationGap,
                cta: opp.type === "audience" ? "Answer the question + “DM us / link in bio to order”" : "One clear CTA: save, share, comment or shop",
            },
            hashtags: tags,
            hashtagRange: [minTags, maxTags],
            slot,
            visualDirection: `${idea.format === "reel" ? "Fast, vertical, product in the first frame" : idea.format === "carousel" ? "Bold hook slide, one idea per slide, brand colours" : "Clean product hero shot, short on-image headline"}. Original to ${brand.name || "the brand"} — never copy competitor visuals.`,
            kpis: { engagementRate: strategy.kpis?.engagementRate ?? null, commentsPerPost: strategy.kpis?.commentsPerPost ?? null },
            references: refs,
            evidence: idea.basedOn || opp.evidence || "",
            do: ["Hook in the first line / first 2 seconds", "Show the product clearly", conversationGap ? "End the caption with a question" : "End with one clear CTA", "Use only the listed hashtags"],
            dont: ["Name, tag or copy a competitor", "Invent claims, prices or numbers", "Use hashtags that are not in the list"],
        };
    });
};

module.exports = { runBriefs };
