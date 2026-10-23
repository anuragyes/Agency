// ─────────────────────────────────────────────────────────────
// codeReport.js — the written report WITHOUT an LLM (useAI = false, or the LLM call failed)
// Same shape as CompetitorReportAgent's output, built from the agents' numbers with templates.
// ─────────────────────────────────────────────────────────────
const FORMAT_LABEL = { reel: "Reels", carousel: "Carousels", image: "Photos", video: "Videos" };

const strengthsOf = (a, med) => {
    const s = [], w = [];
    if (a.engagementRate != null && med.engagementRate != null) (a.engagementRate >= med.engagementRate ? s : w).push(`Engagement rate ${a.engagementRate}% vs median ${med.engagementRate}%`);
    if (a.postsPerWeek != null && med.postsPerWeek != null) (a.postsPerWeek >= med.postsPerWeek ? s : w).push(`Posts ${a.postsPerWeek}×/week vs median ${med.postsPerWeek}`);
    if (a.conversationRate != null && med.conversationRate != null) (a.conversationRate >= med.conversationRate ? s : w).push(`${a.conversationRate} comments per 100 likes (median ${med.conversationRate})`);
    if (a.momentum != null) (a.momentum >= 0 ? s : w).push(`Recent posts ${a.momentum >= 0 ? "up" : "down"} ${Math.abs(a.momentum)}% vs older posts`);
    if (a.outliers) s.push(`${a.outliers} viral outlier post(s)`);
    if (a.consistency != null && a.consistency < 40) w.push(`Inconsistent results (consistency ${a.consistency}/100)`);
    return { strengths: s.slice(0, 3), weaknesses: w.slice(0, 3) };
};

const buildCodeReport = ({ brand = {}, performance, posts, gaps, opportunities, strategy, ideas }) => {
    const med = performance.medians || {};
    const leader = performance.accounts[0];
    const topTheme = (posts.themes || []).find((t) => t.reliable && t.key !== "Other");
    const topFormat = (posts.formats || []).find((f) => f.reliable);
    const opp = opportunities[0];
    const summary = [
        leader ? `@${leader.username} leads with a performance score of ${leader.score}/100 (${leader.engagementRate ?? "—"}% engagement rate).` : "",
        topFormat ? `${FORMAT_LABEL[topFormat.key] || topFormat.key} perform best across competitors (index ${topFormat.performanceIndex}).` : "",
        topTheme ? `"${topTheme.key}" is the strongest content theme (index ${topTheme.performanceIndex}, used by ${topTheme.accounts} accounts).` : "",
        opp ? `Biggest opportunity for ${brand.name || "you"}: ${opp.title.toLowerCase()} — ${opp.evidence}.` : "",
    ].filter(Boolean).join(" ");
    return {
        summary,
        positioning: strategy.positioning,
        competitorInsights: performance.accounts.map((a) => ({ username: a.username, ...strengthsOf(a, med) })),
        captionInsights: [
            ...(posts.hooks || []).filter((h) => h.reliable).slice(0, 2).map((h) => `"${h.key}" opening lines: ${h.posts} posts, performance index ${h.performanceIndex}.`),
            ...(posts.captionLength || []).filter((b) => b.reliable).slice(0, 1).map((b) => `Best caption length: ${b.key} (index ${b.performanceIndex}, ${b.posts} posts).`),
            ...(posts.question || []).filter((q) => q.key === "With question").map((q) => `${q.share}% of captions ask a question (index ${q.performanceIndex}, ${q.commentsPer100Likes} comments / 100 likes).`),
        ].slice(0, 5),
        gaps: gaps.slice(0, 6).map((g) => ({ title: g.title, detail: g.detail, evidence: g.evidence })),
        hashtagPlan: { use: [...(strategy.hashtagSets?.core || []), ...(strategy.hashtagSets?.niche || [])].slice(0, 15), why: "Core = hashtags several competitors share; niche = hashtags they use that you don't. All seen in real posts." },
        contentIdeas: ideas,
        actions: opportunities.slice(0, 8).map((o, i) => ({ action: o.title, priority: i < 2 ? "high" : i < 5 ? "medium" : "low", evidence: o.evidence })),
        source: "code",
        generatedAt: new Date().toISOString(),
    };
};

module.exports = { buildCodeReport };
