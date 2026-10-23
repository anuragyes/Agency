// ─────────────────────────────────────────────────────────────
// Content Strategy Agent (skill: content-strategy.md)
// Code builds the strategy skeleton (cadence, format mix, pillars, slots, hashtags, KPIs, calendar).
// The optional LLM call (CompetitorReportAgent) only writes the narrative + ideas on top of it.
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, clamp } = require("../textUtils.js");

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** shares (weights) -> integer % that sum to 100 */
const toPercent = (items) => {
    const total = items.reduce((n, i) => n + i.weight, 0) || 1;
    const raw = items.map((i) => ({ ...i, exact: (i.weight / total) * 100 }));
    const floored = raw.map((i) => ({ ...i, pct: Math.floor(i.exact) }));
    let left = 100 - floored.reduce((n, i) => n + i.pct, 0);
    [...floored].sort((a, b) => (b.exact - b.pct) - (a.exact - a.pct)).forEach((i) => { if (left > 0) { i.pct++; left--; } });
    return floored.map(({ exact, weight, ...rest }) => rest).sort((a, b) => b.pct - a.pct);
};

/** spread n slots by % (largest remainder) -> ["reel","carousel",…] */
const spread = (mix, n, key) => {
    const counts = mix.map((m) => ({ k: m[key], exact: (m.pct / 100) * n }));
    counts.forEach((c) => { c.n = Math.floor(c.exact); });
    let left = n - counts.reduce((s, c) => s + c.n, 0);
    [...counts].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach((c) => { if (left > 0) { c.n++; left--; } });
    const seq = [];
    const pool = counts.map((c) => ({ ...c }));
    while (seq.length < n && pool.some((c) => c.n > 0)) pool.forEach((c) => { if (c.n > 0 && seq.length < n) { seq.push(c.k); c.n--; } });
    return seq;
};

const runStrategy = ({ brand = {}, posts, performance, opportunities = [], comparison = {}, audience } = {}) => {
    const cfg = skillConfig("content_strategy");
    const med = performance?.medians || {};
    const postsPerWeek = clamp(Math.round(med.postsPerWeek || 4), cfg.minPostsPerWeek || 3, cfg.maxPostsPerWeek || 10);

    // format mix: competitor share × performance, boosted by format opportunities
    const oppFormats = new Set(opportunities.filter((o) => o.type === "format").map((o) => o.format));
    const formatMix = toPercent((posts.formats || []).filter((f) => f.key !== "text" && f.posts >= 2)
        .map((f) => ({ format: f.key, weight: (f.share + 10) * Math.max(0.3, f.performanceIndex || 1) * (oppFormats.has(f.key) ? 1.5 : 1), performanceIndex: f.performanceIndex })))
        .filter((f) => f.pct >= 5);

    // pillars: opportunity pillars weighted by score + Product pillar
    const pw = new Map();
    opportunities.forEach((o) => pw.set(o.pillar, (pw.get(o.pillar) || 0) + o.score));
    if (!pw.has("Product")) pw.set("Product", Math.max(20, ...[...pw.values()].map((v) => v * 0.5)));
    const pillars = toPercent([...pw.entries()].sort((a, b) => b[1] - a[1]).slice(0, cfg.maxPillars || 5).map(([pillar, weight]) => ({ pillar, weight })))
        .map((p) => ({ ...p, why: opportunities.find((o) => o.pillar === p.pillar)?.title || "Keeps your product at the centre of the feed" }));

    // posting slots: best day/time windows
    const cells = [];
    (posts.heatmap?.cells || []).forEach((row, d) => row.forEach((c, s) => cells.push({ ...c, day: posts.heatmap.days[d], slot: posts.heatmap.slots[s] })));
    // night slots (00–06) only when nothing else has data
    const scored = cells.filter((c) => c.posts >= 2 && c.performanceIndex != null).sort((a, b) => b.performanceIndex - a.performanceIndex);
    const ranked = [...scored.filter((c) => !/^0[03]/.test(c.slot)), ...scored.filter((c) => /^0[03]/.test(c.slot))];
    const slots = [];
    for (const c of ranked) {
        if (slots.length >= postsPerWeek) break;
        if (!slots.some((s) => s.day === c.day)) slots.push({ day: c.day, slot: c.slot, performanceIndex: c.performanceIndex, competitorPosts: c.posts });
    }
    const fallbackDays = (comparison.commonBestDays || []).map((d) => d.day);
    for (const d of [...fallbackDays, ...DAY_ORDER]) {
        if (slots.length >= postsPerWeek) break;
        if (!slots.some((s) => s.day === d)) slots.push({ day: d, slot: slots[0]?.slot || "18–21", performanceIndex: null, competitorPosts: 0 });
    }
    slots.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));

    // hashtags (real only)
    const core = (comparison.sharedHashtags || []).filter((h) => !h.brandTag).slice(0, 8).map((h) => h.hashtag);
    const niche = (comparison.hashtagGap || []).filter((h) => !core.includes(h.hashtag)).slice(0, 8).map((h) => h.hashtag);

    // weekly calendar
    const fSeq = spread(formatMix, postsPerWeek, "format");
    const pSeq = spread(pillars, postsPerWeek, "pillar");
    const calendar = slots.slice(0, postsPerWeek).map((s, i) => ({ ...s, format: fSeq[i] || formatMix[0]?.format || "image", pillar: pSeq[i] || pillars[0]?.pillar || "Product" }));

    const kpis = {
        postsPerWeek,
        engagementRate: med.engagementRate,
        commentsPerPost: med.avgComments,
        commentsPer100Likes: med.conversationRate,
        note: "Targets = competitor medians from this research.",
    };
    const themes = pillars.map((p) => p.pillar).filter((p) => p !== "Product").slice(0, 2).map((p) => p.toLowerCase());
    const conv = opportunities.some((o) => o.type === "conversation");
    const positioning = `${brand.name || "Your brand"} should stand apart with ${themes.length ? `${themes.join(" and ")} content` : "product-first content"}` +
        `${formatMix[0] ? `, led by ${formatMix[0].format}s` : ""}${conv ? " and question-led captions that get people talking" : ""}` +
        `${audience?.own?.available ? ", answering what its own audience asks" : ""}.` +
        `${opportunities[0] ? ` Biggest opening: ${opportunities[0].title.charAt(0).toLowerCase()}${opportunities[0].title.slice(1)} (${opportunities[0].score}/100).` : ""}`;

    return { positioning, positioningSource: "code", cadence: { postsPerWeek }, formatMix, pillars, slots, hashtagSets: { core, niche }, kpis, calendar };
};

module.exports = { runStrategy, toPercent, spread };
