// ─────────────────────────────────────────────────────────────
// ContentBriefAgent.js — Studio steps 2 + 3 (ONE LLM call)
//   user's product prompt -> optimized prompt + important words -> small JSON
// Only this JSON (~100 tokens) is sent to the platform researcher the user picks in step 4,
// instead of the whole prompt + product profile -> far fewer tokens.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../llm/factory/LLMFactory");
const buildContentBriefPrompt = require("./ContentBriefPrompt.js");
const { PLATFORM_SPECS, GOALS, FORMAT_HINTS } = require("./PlatformBriefSpecs.js");

const MAX_ATTEMPTS = 2;

const str = (v, max = 240) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v, maxItems, maxLen = 120) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]+/) : [])
        .map((x) => str(typeof x === "string" ? x : x?.text || "", maxLen))
        .filter(Boolean)
        .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
        .slice(0, maxItems);

const parseJson = (text) => {
    if (typeof text !== "string") return text;
    const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return JSON.parse(t);
    } catch {
        const s = t.indexOf("{");
        const e = t.lastIndexOf("}");
        if (s !== -1 && e > s) return JSON.parse(t.slice(s, e + 1));
        throw new Error("Prompt Optimizer returned invalid JSON");
    }
};

/**
 * Clean + clamp the JSON. `platform` is stamped by code in step 5 (never by the LLM);
 * product name / price come from the saved profile when there is one.
 */
const normalizeBrief = (raw, { platform = null, productProfile } = {}) => {
    const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const p = productProfile?.aiProfile || productProfile || {};
    const goal = String(b.goal || "").toLowerCase().trim();
    const hint = String(b.formatHint || "").toLowerCase().trim();

    const brief = {
        platform: PLATFORM_SPECS[platform] ? platform : null,
        optimizedPrompt: str(b.optimizedPrompt, 400),
        importantWords: list(b.importantWords, 10, 40).map((w) => w.replace(/^#+/, "")),
        product: { name: str(p.name, 80) || str(b.productName || b.product?.name, 80) },
        audience: str(b.audience, 160),
        goal: GOALS.includes(goal) ? goal : "awareness",
        angle: str(b.angle, 220),
        keyPoints: list(b.keyPoints, 4, 140),
        facts: list(b.facts, 5, 160),
        tone: str(b.tone, 60),
        cta: str(b.cta, 120),
        formatHint: FORMAT_HINTS.includes(hint) ? hint : "",
        language: str(b.language, 20) || "English",
    };
    const price = p.price?.amount ? `${p.price.currency || ""} ${p.price.amount}`.trim() : str(b.product?.price, 40);
    if (price) brief.product.price = price;
    if (!brief.importantWords.length) brief.importantWords = list(p.keywords, 6, 40);
    return brief;
};

const validateBrief = (brief) => {
    const errors = [];
    if (!brief.optimizedPrompt) errors.push("optimizedPrompt must be a non-empty string");
    if (brief.importantWords.length < 3) errors.push("importantWords must have 5–10 items");
    if (!brief.keyPoints.length) errors.push("keyPoints must have 1–4 items");
    if (!brief.cta) errors.push("cta must be a non-empty string");
    return { valid: errors.length === 0, errors };
};

/** Rough token count when the provider doesn't report usage (≈ 4 chars per token) */
const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

/**
 * @param {Object} args
 * @param {string} args.userPrompt       what the user wrote about their product
 * @param {Object} [args.productProfile] saved aiProfile (optional fact source)
 * @param {Object} [args.llm]            injected LLM (tests)
 * @returns {Promise<{ brief, usage }>}
 */
const generateContentBrief = async ({ userPrompt, productProfile = {}, ragContext = null, llm = LLMFactory.create() } = {}) => {
    if (!userPrompt || !String(userPrompt).trim()) throw new Error("userPrompt is required");

    let fixErrors = [];
    const usage = { promptTokens: 0, completionTokens: 0, estimated: false };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = buildContentBriefPrompt({ userPrompt, productProfile, ragContext, fixErrors });
        const text = await llm.generate({ input: prompt, temperature: 0.3 });

        if (llm.lastUsage) {
            usage.promptTokens += llm.lastUsage.prompt_tokens || 0;
            usage.completionTokens += llm.lastUsage.completion_tokens || 0;
        } else {
            usage.promptTokens += estimateTokens(prompt);
            usage.completionTokens += estimateTokens(text);
            usage.estimated = true;
        }

        let brief;
        try {
            brief = normalizeBrief(parseJson(text), { productProfile });
        } catch (err) {
            fixErrors = ["Return ONE valid JSON object only"];
            if (attempt === MAX_ATTEMPTS) throw err;
            continue;
        }

        const { valid, errors } = validateBrief(brief);
        if (valid) {
            usage.briefTokens = estimateTokens(JSON.stringify(brief)); // what the researcher will receive
            return { brief, usage };
        }
        console.warn(`[PromptOptimizer] attempt ${attempt} invalid:`, errors.join("; "));
        fixErrors = errors;
        if (attempt === MAX_ATTEMPTS) throw new Error(`Prompt optimizer validation failed: ${errors.join(", ")}`);
    }
};

module.exports = generateContentBrief;
module.exports.normalizeBrief = normalizeBrief;
module.exports.validateBrief = validateBrief;
module.exports.estimateTokens = estimateTokens;
