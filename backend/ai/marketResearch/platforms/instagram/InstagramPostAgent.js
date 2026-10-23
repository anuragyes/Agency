// ─────────────────────────────────────────────────────────────
// InstagramPostAgent.js — Step after instargramAgent (research)
// research JSON + product profile  ->  one Instagram image post / reel / carousel
// Also does revisions: same call + previousContent + userPrompt
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../../../llm/factory/LLMFactory");
const buildInstagramPostPrompt = require("./InstagramPostPrompt.js");
const buildInstagramBriefPostPrompt = require("./InstagramBriefPostPrompt.js");
const { filterToVerified } = require("./InstagramHashtagGrounding.js");
const {
    normalizeInstagramPost,
    validateInstagramPost,
    CONTENT_TYPES,
} = require("./InstagramPostValidator.js");

const MAX_ATTEMPTS = 2; // first try + 1 retry with the validation errors

/** Pull a JSON object out of the model text (handles ```json fences and extra words) */
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

/**
 * @param {Object} args
 * @param {Object} args.productProfile     aiProfile of the product
 * @param {Object} args.instagramResearch  `research` object returned by instargramAgent
 * @param {"image"|"reel"|"carousel"} args.contentType
 * @param {string} [args.userPrompt]       extra instructions / change request
 * @param {Object} [args.previousContent]  current draft (revision mode)
 * @param {Object} [args.brief]            compact brief from ContentBriefAgent -> uses the small prompt (Studio flow)
 * @param {Object} [args.research]         compact research from InstagramBriefResearch (brief mode)
 * @param {Object} [args.stats]            filled with { promptTokens, completionTokens, estimated }
 * @param {Object} [args.llm]              injected LLM (tests)
 */
const generateInstagramPost = async ({
    productProfile,
    instagramResearch,
    contentType = "image",
    userPrompt = "",
    previousContent = null,
    brief = null,
    research = null,
    performanceLearnings = null,
    stats = {},
    llm = LLMFactory.create(),
} = {}) => {
    const briefMode = !!(brief && typeof brief === "object");
    if (!briefMode && (!productProfile || typeof productProfile !== "object")) {
        throw new Error("productProfile or brief is required");
    }
    stats.promptTokens = stats.promptTokens || 0;
    stats.completionTokens = stats.completionTokens || 0;
    const verified = new Set((research?.hashtags || []).map((h) => h.hashtag));
    if (!CONTENT_TYPES.includes(contentType)) {
        throw new Error(`contentType must be one of: ${CONTENT_TYPES.join(", ")}`);
    }

    let fixErrors = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = briefMode
            ? buildInstagramBriefPostPrompt({ brief, research, contentType, userPrompt, previousContent, fixErrors, performanceLearnings })
            : buildInstagramPostPrompt({
                productProfile,
                instagramResearch,
                contentType,
                userPrompt,
                previousContent,
                fixErrors,
                performanceLearnings,
            });

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
            post = normalizeInstagramPost(parseJson(text), contentType);
        } catch (err) {
            fixErrors = ["Return ONE valid JSON object only"];
            if (attempt === MAX_ATTEMPTS) throw err;
            continue;
        }

        // brief mode + live data: keep only real Instagram hashtags (fallback = top of the live ranking)
        if (briefMode && verified.size) {
            const { kept } = filterToVerified(post.hashtags, verified);
            post.hashtags = (kept.length ? kept : [...verified].slice(0, 5)).slice(0, 5);
            post.hashtagSource = "instagram_api"; // real hashtags -> the editor keeps them, AI revisions keep them
        }

        const { valid, errors } = validateInstagramPost(post);
        if (valid) return post;

        console.warn(`[InstagramPostAgent] attempt ${attempt} invalid:`, errors.join("; "));
        fixErrors = errors;
        if (attempt === MAX_ATTEMPTS) {
            throw new Error(`Instagram post validation failed: ${errors.join(", ")}`);
        }
    }
};

module.exports = generateInstagramPost;
