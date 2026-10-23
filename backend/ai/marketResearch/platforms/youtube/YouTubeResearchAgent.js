// ─────────────────────────────────────────────────────────────
// YouTubeResearchAgent.js — YouTube Research (diagram row 2, box 2)
// YouTube is a SEARCH engine: focus on what people search, long-form vs Shorts.
// ─────────────────────────────────────────────────────────────
const { createResearchAgent } = require("../../BaseResearchAgent");

const YouTubeResearchAgent = createResearchAgent({
    platform: "youtube",
    label: "YouTube",
    focus: [
        "Search intent: questions and problems people would type into YouTube about this product",
        "Format fit: long-form (reviews, how-to, comparisons, unboxing) vs YouTube Shorts",
        "Title and thumbnail angles that match the audience's intent",
        "Competitor channels and video types (only from supplied data)",
        "Keyword opportunities for titles, descriptions and tags",
        "Audience segments and the questions/objections they have before buying",
        "Content gaps: topics with demand but weak existing videos",
    ],
    rules: [
        "Put searchable phrases (e.g. 'best x for y', 'x review') in contentInsights.keywords.",
        "hashtags: max 5, YouTube shows only the first 3 above the title.",
    ],
});

module.exports = YouTubeResearchAgent;
