// ─────────────────────────────────────────────────────────────
// Content Ideation Agent (skill: content-ideation.md)
//   mergeIdeas(): ideas from the single LLM call -> linked to real opportunities, hashtags grounded
//   fallbackIdeas(): no LLM — one idea per top opportunity from the hook templates in the skill file
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");

const FORMATS = ["reel", "carousel", "image"];
/** topic = first brand keyword that isn't already in the brand name ("Ycoo Coffee" + "coffee" -> next keyword) */
const topicOf = (brand = {}) => {
    const name = String(brand.name || "").toLowerCase();
    const list = [...(brand.keywords || []), ...String(brand.category || "").split(/[>\/,&|]+/).reverse()].map((k) => String(k || "").trim().toLowerCase()).filter((k) => k.length >= 3);
    return list.find((k) => !name.includes(k)) || list[0] || "product";
};
const fill = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "").replace(/\s+/g, " ").trim();
const toFormat = (f) => (FORMATS.includes(f) ? f : f === "video" ? "reel" : "image");

const fallbackIdeas = ({ brand = {}, opportunities = [], strategy = {} } = {}) => {
    const cfg = skillConfig("content_ideation");
    const vars = { brand: brand.name || "our brand", topic: topicOf(brand) };
    const tags = [...(strategy.hashtagSets?.core || []).slice(0, 4), ...(strategy.hashtagSets?.niche || []).slice(0, 4)];
    const used = new Set();
    return opportunities.slice(0, cfg.maxIdeas || 6).map((o) => {
        const style = o.type === "hook" ? (cfg.hookStyles || {})[String(o.title).match(/"(.+)"/)?.[1]] : null;
        let title = fill((cfg.titles || {})[o.pillar] || (cfg.titles || {}).Other, vars);
        title = title.replace(/^./, (c) => c.toUpperCase());
        if (used.has(title)) title = `${o.title}: ${vars.topic} edition`.replace(/^./, (c) => c.toUpperCase());
        used.add(title);
        return {
            title,
            format: toFormat(o.format),
            hook: fill(style || (cfg.hooks || {})[o.pillar] || (cfg.hooks || {}).Other, vars).slice(0, 120),
            angle: `${(cfg.angles || {})[o.type] || ""} ${o.why || ""}`.trim(),
            hashtags: tags,
            basedOn: `${o.title}: ${o.evidence}`,
            opportunityId: o.id,
            pillar: o.pillar,
            source: "code",
        };
    });
};

/** attach LLM ideas to opportunities (by id, else by format/pillar), keep only real hashtags */
const mergeIdeas = ({ llmIdeas = [], opportunities = [], realTags = new Set() } = {}) => {
    const byId = new Map(opportunities.map((o) => [o.id, o]));
    return llmIdeas.map((idea, i) => {
        let opp = byId.get(idea.opportunityId);
        if (!opp) opp = opportunities.find((o) => o.format === idea.format) || opportunities[i % Math.max(1, opportunities.length)];
        return {
            ...idea,
            format: toFormat(idea.format),
            hashtags: (idea.hashtags || []).filter((h) => realTags.has(String(h).toLowerCase())),
            opportunityId: opp?.id || null,
            pillar: idea.pillar || opp?.pillar || "Product",
            source: "ai",
        };
    });
};

module.exports = { fallbackIdeas, mergeIdeas };
