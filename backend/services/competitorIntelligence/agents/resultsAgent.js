// ─────────────────────────────────────────────────────────────
// Performance Analysis + Strategy Improvement Agent (skill: performance-analysis.md) — NO LLM
// Published posts created from this report -> real results (Graph API) -> vs strategy KPIs -> improvements
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, mean } = require("../textUtils.js");

/**
 * @param {Array} items [{ ideaIndex, idea, brief, post (InstagramPost lean), result (getOwnMediaResults) | null }]
 * @param {Object} strategy  report.intelligence.strategy
 * @param {number} followers your followers (for ER)
 */
const runResults = ({ items = [], strategy = {}, followers = null } = {}) => {
    const cfg = skillConfig("performance_analysis");
    const target = strategy?.kpis?.engagementRate ?? null;
    const targetComments = strategy?.kpis?.commentsPerPost ?? null;
    const rows = items.map(({ ideaIndex, idea, post, result }) => {
        const eng = result ? (result.likes || 0) + (result.comments || 0) : null;
        const er = result && followers ? round((eng / followers) * 100, 3) : null;
        const verdict = er == null || target == null ? "pending" : er >= target ? "above" : er < target * (cfg.underperformRatio || 0.7) ? "below" : "near";
        return {
            ideaIndex, title: idea?.title || post?.content?.title || "Post", format: idea?.format || post?.contentType, pillar: idea?.pillar || null,
            status: post?.status || "unknown", permalink: result?.permalink || post?.instagram?.permalink || null,
            publishedAt: post?.instagram?.publishedAt || result?.timestamp || null,
            likes: result?.likes ?? null, comments: result?.comments ?? null, insights: result?.insights || {}, engagementRate: er, verdict,
        };
    });
    const live = rows.filter((r) => r.engagementRate != null);
    const improvements = [];
    const groupVerdict = (key) => {
        const m = new Map();
        live.forEach((r) => { if (!r[key]) return; const s = m.get(r[key]) || []; s.push(r); m.set(r[key], s); });
        return [...m.entries()].map(([k, list]) => ({ key: k, er: mean(list.map((r) => r.engagementRate)), n: list.length }));
    };
    const shift = cfg.shift || 10;
    for (const g of [...groupVerdict("pillar").map((x) => ({ ...x, kind: "pillar" })), ...groupVerdict("format").map((x) => ({ ...x, kind: "format" }))]) {
        if (target == null) break;
        if (g.er >= target) improvements.push({ action: `Double down on ${g.kind} “${g.key}”: raise its share by ${shift} pts`, evidence: `${round(g.er, 2)}% ER on ${g.n} post(s) vs ${target}% target`, priority: "high" });
        else if (g.er < target * (cfg.underperformRatio || 0.7)) improvements.push({ action: `Reduce ${g.kind} “${g.key}” by ${shift} pts and test the next opportunity`, evidence: `${round(g.er, 2)}% ER on ${g.n} post(s) vs ${target}% target`, priority: "medium" });
    }
    const avgC = mean(live.map((r) => r.comments));
    if (targetComments != null && avgC != null && avgC < targetComments) improvements.push({ action: "Add a direct question + CTA to every caption", evidence: `${round(avgC, 1)} comments/post vs ${targetComments} target`, priority: "high" });
    const saves = live.filter((r) => r.insights.saved != null && r.likes);
    if (saves.length && mean(saves.map((r) => r.insights.saved / r.likes)) >= 0.1) improvements.push({ action: "Saves are high — make more educational carousels", evidence: `${round(mean(saves.map((r) => (r.insights.saved / r.likes) * 100)), 1)} saves per 100 likes`, priority: "medium" });

    return {
        analyzedAt: new Date().toISOString(),
        posts: rows,
        summary: {
            created: rows.length, published: rows.filter((r) => r.status === "published").length, measured: live.length,
            avgEngagementRate: round(mean(live.map((r) => r.engagementRate)), 3), targetEngagementRate: target,
            above: live.filter((r) => r.verdict === "above").length, below: live.filter((r) => r.verdict === "below").length,
        },
        improvements,
    };
};

module.exports = { runResults };
