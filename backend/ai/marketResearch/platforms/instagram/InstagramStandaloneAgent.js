
// Standalone Instagram agent used by POST /api/instagram/research (quick content ideas).
// The full pipeline uses InstagramResearchAgent.js instead.
const LLMFactory = require("../../../../llm/factory/LLMFactory");

const buildInstagramResearchPrompt = require("./InstagramResearchPrompt.js");

const validateInstagramResearch = require("./InstagramResearchValidator.js");

const { researchProductHashtags } = require("../../../../services/instagramHashtagResearchService.js");
const { applyHashtagGrounding } = require("./InstagramHashtagGrounding.js");

const generateInstagramResearch = async (product) => {
    try {
        if (!product || typeof product !== "object") {
            throw new Error("Valid product information is required");
        }

        // 1. REAL hashtag data from the official Instagram Graph API (never throws).
        //    Optional: send "seedHashtags": ["ghee", "desighee"] in the body to choose the start hashtags.
        const { seedHashtags, ...productInfo } = product;
        const hashtagData = await researchProductHashtags(productInfo, { seedHashtags });

        // 2. LLM picks the relevant hashtags FROM that data + writes audience / content ideas
        const prompt = buildInstagramResearchPrompt(productInfo, hashtagData);

        const llm = LLMFactory.create();

        const response = await llm.generate({ input: prompt, temperature: 0.2 });

        let research;

        try {
            research =
                typeof response === "string"
                    ? JSON.parse(response.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""))
                    : response;
        } catch (error) {
            throw new Error("LLM returned invalid JSON");
        }

        const validation = validateInstagramResearch(research);

        if (!validation.valid) {
            throw new Error(
                `Instagram research validation failed: ${validation.errors.join(", ")}`
            );
        }

        // 3. Code check: drop any hashtag that is not in the live data, attach real metrics
        applyHashtagGrounding(research, hashtagData);

        return {
            success: true,
            platform: "instagram",
            research,
        };

    } catch (error) {
        console.error(
            "Instagram Research Agent Error:",
            error.message
        );

        throw error;
    }
};

module.exports = generateInstagramResearch;