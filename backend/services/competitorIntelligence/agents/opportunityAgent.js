// ─────────────────────────────────────────────────────────────
// Content Opportunity Agent (skill: content-opportunity.md) — NO LLM
// gaps -> ranked, brand-specific opportunities (impact × whitespace × brand fit × ease × confidence)
// ─────────────────────────────────────────────────────────────
const { skillConfig, getSkill } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, clamp, countMatches, brandText } = require("../textUtils.js");

const FORMAT_LABEL = { reel: "Reels", carousel: "Carousels", image: "Photos", video: "Videos" };
const BASE_FIT = {
    Product: 100, Educational: 65, "Recipe / How to use": 60, "Customer / User-Generated Content": 65, "Behind the scenes": 60, "Lifestyle / Mood": 55,
    "Entertainment / Trend": 50, "Festive / Seasonal": 50, "Product showcase": 70, "Offer / Promo": 50, "Giveaway / Contest": 45, "Collab / Influencer": 45, "Sustainability / Values": 40
};

/** how well a theme fits THIS brand: base fit + brand words found in the theme's lexicon */
const themeFit = (theme, brand, lexicon) => {
    if (!theme) return 70;
    const text = ` ${brandText(brand)} `;
    const hits = countMatches(text, lexicon[theme] || []);
    return round(clamp((BASE_FIT[theme] ?? 45) + hits * 12));
};

const bestSlot = (posts) => {
    const cells = [];
    (posts.heatmap?.cells || []).forEach((row, d) => row.forEach((c, s) => cells.push({ ...c, day: posts.heatmap.days[d], slot: posts.heatmap.slots[s] })));
    const c = cells.filter((x) => x.posts >= 2 && x.performanceIndex != null).sort((a, b) => b.performanceIndex - a.performanceIndex)[0];
    return c ? { day: c.day, slot: c.slot } : null;
};

const TITLE = {
    theme: (g) => `Own the "${g.theme}" space`,
    format: (g) => `Lead with ${FORMAT_LABEL[g.format] || g.format}`,
    conversation: () => "Question-led captions that start conversations",
    cta: () => "Clear calls to action on every post",
    timing: (g) => `Post in the ${g.slot.day} ${g.slot.slot} window`,
    hashtag: () => "Join the hashtags your category already uses",
    audience: (g) => `Answer your audience: ${String(g.intent || "").toLowerCase()}`,
    frequency: () => "Post more consistently",
    hook: (g) => `Use "${g.hookType}" hooks`,
};

const runOpportunity = ({ gaps = [], posts, brand = {} } = {}) => {
    const cfg = skillConfig("content_opportunity");
    const w = cfg.weights || {};
    const effort = cfg.effort || {};
    const lexicon = getSkill("post_analysis").config.themes || {};
    const formats = (posts.formats || []).filter((f) => f.reliable && f.key !== "text");
    const bestFormat = formats[0]?.key || "image";
    const slot = bestSlot(posts);
    // themes that perform and fit the brand -> pillar for non-theme opportunities
    const fitThemes = (posts.themes || []).filter((t) => t.key !== "Other" && t.reliable && (t.performanceIndex ?? 0) >= 1)
        .map((t) => ({ ...t, fit: themeFit(t.key, brand, lexicon) })).filter((t) => t.fit >= 55).sort((a, b) => b.performanceIndex * b.fit - a.performanceIndex * a.fit);

    const seen = new Set();
    const out = [];
    gaps.forEach((g, i) => {
        const title = (TITLE[g.type] || (() => g.title))(g);
        if (seen.has(title)) return;
        seen.add(title);
        const format = g.format || bestFormat;
        const pillar = g.theme || fitThemes[i % Math.max(1, fitThemes.length)]?.key || "Product";
        const parts = {
            impact: round(clamp(g.lift > 1 ? ((g.lift - 1) / 1.5) * 100 : 30)),
            whitespace: round(clamp((1 - (g.saturation ?? 0.5)) * 100)),
            brandFit: g.type === "audience" ? 100 : g.type === "theme" ? themeFit(g.theme, brand, lexicon) : 70,
            ease: round(clamp((effort[format] ?? 0.7) * 100)),
            confidence: round(clamp(((g.sample || 0) / 15) * 100)),
        };
        let sum = 0, ws = 0;
        Object.entries(w).forEach(([k, v]) => { sum += (parts[k] ?? 0) * v; ws += v; });
        out.push({
            id: `opp_${out.length + 1}`,
            title, type: g.type, gapId: g.id,
            score: round(ws ? sum / ws : 0),
            parts,
            pillar, format,
            slot: g.slot || slot,
            hashtags: g.hashtags || [],
            why: g.detail, evidence: g.evidence,
        });
    });
    const opportunities = out.sort((a, b) => b.score - a.score).slice(0, cfg.maxOpportunities || 8).map((o, i) => ({ ...o, id: `opp_${i + 1}`, rank: i + 1 }));
    return { opportunities, bestFormat, bestSlot: slot, fitThemes: fitThemes.slice(0, 6).map((t) => ({ theme: t.key, fit: t.fit, performanceIndex: t.performanceIndex })) };
};

module.exports = { runOpportunity, themeFit };
