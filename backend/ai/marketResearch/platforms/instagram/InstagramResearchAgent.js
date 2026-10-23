// ─────────────────────────────────────────────────────────────
// InstagramResearchAgent.js — Instagram Research (diagram row 2, box 1)
// Used by MarketResearchOrchestrator. Same shared output shape as the other platforms
// (see ai/schemas/ResearchSchema.js), so the Research Aggregator can merge it.
//
// Hashtags: before the LLM runs, we fetch LIVE hashtag data from the official
// Instagram Graph API and add it to research_data, so contentInsights.hashtags
// are real, current hashtags — not the LLM's old training data.
// ─────────────────────────────────────────────────────────────
const { createResearchAgent, _internals: { hasRealData } } = require("../../BaseResearchAgent");
const { researchProductHashtags } = require("../../../../services/instagramHashtagResearchService.js");
const { isHashtagApiConfigured } = require("../../../../services/instagramService.js");
const { hasVerifiedHashtags, toPromptHashtagData, filterToVerified } = require("./InstagramHashtagGrounding.js");

const baseInstagramAgent = createResearchAgent({
    platform: "instagram",
    label: "Instagram",
    focus: [
        "Competitor content strategies (only from supplied data)",
        "Target audience segments, interests and content preferences",
        "Content formats that fit this product: Reels, carousels, Stories, posts",
        "Hashtag patterns: broad vs niche hashtags for this category",
        "Keyword opportunities for captions and profile SEO",
        "Market opportunities and content gaps",
    ],
    rules: [
        "Never claim a hashtag or trend is currently popular without supplied evidence.",
        "Never invent competitor accounts or engagement metrics.",
        "If research_data contains liveHashtags.verifiedHashtags, contentInsights.hashtags must be picked ONLY from that list " +
            "(exact spelling), choosing the ones most relevant to the product and skipping spam like #explore or #viral.",
    ],
});

const InstagramResearchAgent = async (args = {}) => {
    const { product, researchData = [] } = args;

    // 1. Live hashtag data (skipped when credentials are missing, e.g. in tests)
    let hashtagData = null;
    if (isHashtagApiConfigured()) {
        hashtagData = await researchProductHashtags(product);
    }

    if (!hasVerifiedHashtags(hashtagData)) {
        const result = await baseInstagramAgent(args);
        if (hashtagData && Array.isArray(result.limitations)) result.limitations.push(...hashtagData.limitations);
        return result;
    }

    // 2. Run the normal agent with the live hashtags added to its research data
    const liveHashtags = toPromptHashtagData(hashtagData);
    const combined = hasRealData(researchData) ? { suppliedData: researchData, liveHashtags } : { liveHashtags };
    const result = await baseInstagramAgent({ ...args, researchData: combined });

    // 3. Code check: keep only verified hashtags (fallback = top of the API ranking)
    if (result.contentInsights) {
        const verifiedSet = new Set(hashtagData.hashtags.map((h) => h.hashtag));
        const { kept, removed } = filterToVerified(result.contentInsights.hashtags, verifiedSet);
        result.contentInsights.hashtags = kept.length ? kept : hashtagData.hashtags.slice(0, 15).map((h) => h.hashtag);
        if (removed) result.limitations.push(`${removed} AI-suggested hashtag(s) removed: not found in live Instagram data.`);
    }
    result.limitations?.push(...hashtagData.limitations);
    result.liveHashtags = {
        source: "instagram_graph_api",
        status: hashtagData.status,
        fetchedAt: hashtagData.fetchedAt,
        seeds: hashtagData.seeds,
        hashtags: hashtagData.hashtags.filter((h) => result.contentInsights?.hashtags.includes(h.hashtag)),
    };
    return result;
};

module.exports = InstagramResearchAgent;
