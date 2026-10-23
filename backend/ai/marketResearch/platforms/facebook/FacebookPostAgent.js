// ─────────────────────────────────────────────────────────────
// FacebookPostAgent.js — brief + Page research -> one Facebook text / photo / album / reel post
// Also does revisions: same call + previousContent + userPrompt
// Without a Studio brief (e.g. old flow) it builds a tiny brief from the product profile.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../../../llm/factory/LLMFactory");
const buildFacebookBriefPostPrompt = require("./FacebookBriefPostPrompt.js");
const { normalizeFacebookPost, validateFacebookPost, CONTENT_TYPES } = require("./FacebookPostValidator.js");

const MAX_ATTEMPTS = 2;

const parseJson = (text) => {
    if (typeof text !== "string") return text;
    const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
        throw new Error("LLM returned invalid JSON");
    }
};

/** Product profile -> minimal brief (only facts the profile has) */
const briefFromProfile = (p = {}) => ({
    product: { name: p.name || "", category: p.category || "" },
    optimizedPrompt: `Write a Facebook post that introduces ${p.name || "the product"} to its audience.`,
    importantWords: (p.keywords || []).slice(0, 8),
    audience: Array.isArray(p.targetAudience) ? p.targetAudience.slice(0, 3).join(", ") : p.targetAudience || "",
    facts: [p.description, ...(p.features || []).slice(0, 5), ...(p.benefits || []).slice(0, 5)].filter(Boolean).map(String).slice(0, 10),
    tone: p.brandVoice || p.tone || "friendly",
    cta: "",
});

/**
 * @param {Object} args
 * @param {Object} [args.brief]          from ContentBriefAgent (Studio)
 * @param {Object} [args.productProfile] used when there is no brief
 * @param {Object} [args.research]       FacebookBriefResearch (or competitor research) result
 * @param {"text"|"image"|"carousel"|"reel"} args.contentType
 */
const generateFacebookPost = async ({
    brief = null,
    productProfile = null,
    research = null,
    contentType = "image",
    userPrompt = "",
    previousContent = null,
    performanceLearnings = null,
    stats = {},
    llm = LLMFactory.create(),
} = {}) => {
    if (!CONTENT_TYPES.includes(contentType)) throw new Error(`contentType must be one of: ${CONTENT_TYPES.join(", ")}`);
    const useBrief = brief && typeof brief === "object" ? brief : productProfile && typeof productProfile === "object" ? briefFromProfile(productProfile) : null;
    if (!useBrief) throw new Error("brief or productProfile is required");
    stats.promptTokens = stats.promptTokens || 0;
    stats.completionTokens = stats.completionTokens || 0;

    let fixErrors = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = buildFacebookBriefPostPrompt({ brief: useBrief, research, contentType, userPrompt, previousContent, fixErrors, performanceLearnings });
        const text = await llm.generate({ input: prompt, temperature: previousContent ? 0.6 : 0.8 });
        if (llm.lastUsage) {
            stats.promptTokens += llm.lastUsage.prompt_tokens || 0;
            stats.completionTokens += llm.lastUsage.completion_tokens || 0;
        } else {
            stats.promptTokens += Math.ceil(prompt.length / 4);
            stats.completionTokens += Math.ceil(String(text || "").length / 4);
            stats.estimated = true;
        }

        let post;
        try {
            post = normalizeFacebookPost(parseJson(text), contentType);
        } catch (err) {
            fixErrors = ["Return ONE valid JSON object only"];
            if (attempt === MAX_ATTEMPTS) throw err;
            continue;
        }

        const { valid, errors } = validateFacebookPost(post);
        if (valid) return post;
        console.warn(`[FacebookPostAgent] attempt ${attempt} invalid:`, errors.join("; "));
        fixErrors = errors;
        if (attempt === MAX_ATTEMPTS) throw new Error(`Facebook post validation failed: ${errors.join(", ")}`);
    }
};

module.exports = generateFacebookPost;
module.exports.briefFromProfile = briefFromProfile;
