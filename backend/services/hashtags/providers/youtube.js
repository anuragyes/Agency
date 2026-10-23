// YouTube — NOT CONNECTED YET.
// To make it live: add explore() below. Copy the pattern from instagram.js
// and build the result with buildHashtagResult() — the Hashtags page enables YouTube automatically.
const { defineProvider } = require("../providerContract.js");
// const { buildHashtagResult } = require("../buildHashtagResult.js");

module.exports = defineProvider({
    id: "youtube",
    name: "YouTube",
    source: "YouTube Data API v3",
    envVars: ["YOUTUBE_API_KEY"],
    apiDocs: "https://developers.google.com/youtube/v3/docs/search/list",
    quotaNote: "YouTube Data API has a daily unit quota; search.list is one of the most expensive calls.",
    notes: [
        "Idea: search.list?q=%23<seed>&type=video (order=viewCount for 'top', order=date + publishedAfter for 'recent').",
        "Then videos.list?part=snippet,statistics for likes / comments / tags / description hashtags.",
    ],
    // explore: async ({ seeds }) => buildHashtagResult({ source: "YouTube Data API v3", seeds, seedStats, groups, limitations }),
});
