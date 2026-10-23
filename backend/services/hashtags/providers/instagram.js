// Instagram — LIVE. Real data from the official Instagram Graph API (hashtag search,
// top_media + recent_media). No LLM anywhere in this flow.
const { defineProvider } = require("../providerContract.js");
const { exploreHashtags, quotaInfo } = require("../../instagramHashtagResearchService.js");
const { isHashtagApiConfigured } = require("../../instagramService.js");

module.exports = defineProvider({
    id: "instagram",
    name: "Instagram",
    source: "Instagram Graph API",
    envVars: ["META_ACCESS_TOKEN", "META_INSTAGRAM_USER_ID", "META_GRAPH_API_VERSION"],
    apiDocs: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search",
    quotaNote: "Meta allows 30 NEW hashtag searches per 7 days. Searching a hashtag again is free (cached).",
    isConfigured: isHashtagApiConfigured,

    // "Find real hashtags": the seeds the user typed
    explore: ({ seeds }) => exploreHashtags({ seeds }),

    quota: quotaInfo,
});
