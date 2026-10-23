// ─────────────────────────────────────────────────────────────
// ResearchSchema.js — ONE shared shape for every platform research agent
// (Instagram, YouTube, Facebook, WhatsApp, Pinterest).
// Why: if all 5 agents return the same shape, the Research Aggregator
// and the next phase (Platform Strategy Orchestrator) can treat them the same way.
// ─────────────────────────────────────────────────────────────

// STEP 1: The list of supported platforms (single source of truth)
const PLATFORMS = ["instagram", "youtube", "facebook", "whatsapp", "pinterest"];

// STEP 2: Allowed values for small "enum" fields
const PRIORITIES = ["high", "medium", "low"];
const BASIS = ["provided_data", "general_platform_knowledge"];     // where a recommendation comes from

const str = { type: "string" };
const strArray = { type: "array", items: str };

// STEP 3: JSON schema sent to Gemini (structured output). The model is forced to follow it.
const RESEARCH_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        // ADDED: how well this platform fits the product (0-100). The aggregator ranks platforms with it.
        platformFit: {
            type: "object",
            properties: {
                score: { type: "number" },
                verdict: { type: "string", enum: PRIORITIES },
                reasoning: str,
            },
            required: ["score", "verdict", "reasoning"],
        },
        marketOverview: {
            type: "object",
            properties: { summary: str, trends: strArray, opportunities: strArray },
            required: ["summary", "trends", "opportunities"],
        },
        // CHANGED: competitors are objects (name + what was observed + where), not loose strings
        competitors: {
            type: "array",
            items: {
                type: "object",
                properties: { name: str, observation: str, source: str },
                required: ["name", "observation"],
            },
        },
        audienceInsights: {
            type: "object",
            properties: {
                audienceSegments: strArray, interests: strArray,
                painPoints: strArray, contentPreferences: strArray,
            },
            required: ["audienceSegments", "interests", "painPoints", "contentPreferences"],
        },
        contentInsights: {
            type: "object",
            properties: {
                popularFormats: strArray, contentThemes: strArray,
                keywords: strArray, hashtags: strArray,
            },
            required: ["popularFormats", "contentThemes", "keywords", "hashtags"],
        },
        contentGaps: strArray,                                       // ADDED: what nobody is doing yet = opportunity
        // CHANGED: recommendations carry priority + basis so we can tell evidence from general advice
        recommendations: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    action: str,
                    reason: str,
                    priority: { type: "string", enum: PRIORITIES },
                    basis: { type: "string", enum: BASIS },
                },
                required: ["action", "reason", "priority", "basis"],
            },
        },
        risks: strArray,                                             // ADDED: policy / brand / compliance risks
        sources: strArray,
        limitations: strArray,
    },
    required: [
        "platformFit", "marketOverview", "competitors", "audienceInsights", "contentInsights",
        "contentGaps", "recommendations", "risks", "sources", "limitations",
    ],
};

// STEP 4: Empty result — used when an agent fails, so the shape is ALWAYS the same
const emptyResearch = (platform = "", productId = "") => ({
    platform,
    productId: productId ? String(productId) : "",
    platformFit: { score: 0, verdict: "low", reasoning: "" },
    marketOverview: { summary: "", trends: [], opportunities: [] },
    competitors: [],
    audienceInsights: { audienceSegments: [], interests: [], painPoints: [], contentPreferences: [] },
    contentInsights: { popularFormats: [], contentThemes: [], keywords: [], hashtags: [] },
    contentGaps: [],
    recommendations: [],
    risks: [],
    sources: [],
    limitations: [],
});

// ── small cleaning helpers ──────────────────────────────────

// Trim a value to a clean string ("" if not a string/number)
const cleanStr = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// Turn anything into a de-duplicated array of non-empty strings (max `limit` items)
function cleanList(v, limit = 15) {
    const arr = Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
    const seen = new Set();
    return arr
        .map(cleanStr)
        .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
        .slice(0, limit);
}

// Keep a value only if it is in the allowed list, otherwise use the fallback
const oneOf = (v, allowed, fallback) => (allowed.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : fallback);

// Normalise hashtags: "#Organic Ghee" -> "#organicghee"
const cleanHashtags = (v) =>
    cleanList(v, 30)
        .map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase())
        .filter((h) => h.length > 1);

// STEP 5: normalizeResearch — force ANY model output into the exact shape above.
// Same idea as normalizeProfile() in ProductAiAgent: never trust the raw LLM JSON.
function normalizeResearch(raw, platform, productId) {
    const out = emptyResearch(platform, productId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

    // platformFit: clamp score to 0..100 and derive verdict from the score if missing/invalid
    const fit = raw.platformFit || {};
    let score = Number(fit.score);
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const derived = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    out.platformFit = { score, verdict: oneOf(fit.verdict, PRIORITIES, derived), reasoning: cleanStr(fit.reasoning) };

    const mo = raw.marketOverview || {};
    out.marketOverview = { summary: cleanStr(mo.summary), trends: cleanList(mo.trends), opportunities: cleanList(mo.opportunities) };

    // competitors: accept strings or objects; drop entries without a name
    out.competitors = (Array.isArray(raw.competitors) ? raw.competitors : [])
        .map((c) => (typeof c === "string" ? { name: c, observation: "", source: "" } : c || {}))
        .map((c) => ({ name: cleanStr(c.name), observation: cleanStr(c.observation), source: cleanStr(c.source) }))
        .filter((c) => c.name)
        .slice(0, 10);

    const ai = raw.audienceInsights || {};
    out.audienceInsights = {
        audienceSegments: cleanList(ai.audienceSegments), interests: cleanList(ai.interests),
        painPoints: cleanList(ai.painPoints), contentPreferences: cleanList(ai.contentPreferences),
    };

    const ci = raw.contentInsights || {};
    out.contentInsights = {
        popularFormats: cleanList(ci.popularFormats), contentThemes: cleanList(ci.contentThemes),
        keywords: cleanList(ci.keywords, 20).map((k) => k.toLowerCase()), hashtags: cleanHashtags(ci.hashtags),
    };

    out.contentGaps = cleanList(raw.contentGaps);

    // recommendations: accept plain strings too (old prompt format) and fill defaults
    out.recommendations = (Array.isArray(raw.recommendations) ? raw.recommendations : [])
        .map((r) => (typeof r === "string" ? { action: r } : r || {}))
        .map((r) => ({
            action: cleanStr(r.action),
            reason: cleanStr(r.reason),
            priority: oneOf(r.priority, PRIORITIES, "medium"),
            basis: oneOf(r.basis, BASIS, "general_platform_knowledge"),
        }))
        .filter((r) => r.action)
        .slice(0, 10);

    out.risks = cleanList(raw.risks);
    out.sources = cleanList(raw.sources, 30);
    out.limitations = cleanList(raw.limitations);
    return out;
}

module.exports = {
    PLATFORMS,
    PRIORITIES,
    BASIS,
    RESEARCH_RESPONSE_SCHEMA,
    emptyResearch,
    normalizeResearch,
    cleanList,
};
