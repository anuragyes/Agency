// ─────────────────────────────────────────────────────────────
// Quality Check Agent (skill: quality-check.md) — NO LLM
// Every brief gets a list of pass/fail checks and a 0-100 score before customer approval.
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { jaccard, norm } = require("../textUtils.js");

const runQualityCheck = ({ briefs = [], realTags = new Set(), competitorNames = [] } = {}) => {
    const cfg = skillConfig("quality_check");
    const w = cfg.weights || {};
    const names = [...new Set(competitorNames.map((n) => String(n || "").toLowerCase().trim()).filter((n) => n.length >= 5 || /\s/.test(n)))];

    const results = briefs.map((b, i) => {
        const text = norm(`${b.title} ${b.hook} ${b.angle}`);
        const fake = b.hashtags.filter((h) => !realTags.has(String(h).toLowerCase()));
        const named = names.filter((n) => text.includes(n) || text.includes(`@${n}`));
        const similar = briefs.find((o, j) => j !== i && jaccard(o.title, b.title) >= (cfg.maxSimilarity || 0.6));
        const checks = [
            { key: "groundedHashtags", label: "Hashtags come from real posts", pass: !fake.length, detail: fake.length ? `Not seen in data: ${fake.join(" ")}` : `${b.hashtags.length} real hashtags` },
            { key: "hashtagCount", label: "Hashtag count in range", pass: b.hashtags.length >= b.hashtagRange[0] && b.hashtags.length <= b.hashtagRange[1], detail: `${b.hashtags.length} (allowed ${b.hashtagRange[0]}–${b.hashtagRange[1]})` },
            { key: "hookLength", label: "Hook is short enough", pass: !!b.hook && b.hook.length <= (cfg.maxHookChars || 125), detail: `${(b.hook || "").length} chars` },
            { key: "evidence", label: "Backed by evidence", pass: !!b.evidence, detail: b.evidence ? b.evidence.slice(0, 120) : "No evidence" },
            { key: "noCompetitorNames", label: "No competitor names", pass: !named.length, detail: named.length ? `Mentions ${named.join(", ")}` : "Original" },
            { key: "format", label: "Valid format + posting slot", pass: ["reel", "carousel", "image"].includes(b.format) && !!b.slot, detail: `${b.format}${b.slot ? ` · ${b.slot.day} ${b.slot.slot}` : " · no slot"}` },
            { key: "unique", label: "Not a duplicate idea", pass: !similar, detail: similar ? `Similar to “${similar.title}”` : "Unique" },
            { key: "cta", label: "Has a call to action", pass: !!b.caption?.cta, detail: b.caption?.cta || "Missing" },
        ];
        let got = 0, total = 0;
        checks.forEach((c) => { const wt = w[c.key] ?? 10; total += wt; if (c.pass) got += wt; });
        const score = Math.round((got / Math.max(1, total)) * 100);
        return { briefId: b.id, ideaIndex: b.ideaIndex, score, pass: score >= (cfg.passScore || 70), checks };
    });
    return {
        results,
        passed: results.filter((r) => r.pass).length,
        avgScore: results.length ? Math.round(results.reduce((n, r) => n + r.score, 0) / results.length) : null,
    };
};

module.exports = { runQualityCheck };
