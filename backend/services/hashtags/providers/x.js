// X (Twitter) — NOT CONNECTED YET. Add explore() to make it live (see instagram.js + buildHashtagResult.js).
const { defineProvider } = require("../providerContract.js");

module.exports = defineProvider({
    id: "x",
    name: "X",
    source: "X API v2",
    envVars: ["X_BEARER_TOKEN"],
    apiDocs: "https://docs.x.com/x-api/posts/search/introduction",
    notes: [
        "Idea: recent search with query '#<seed>' + tweet.fields=public_metrics,created_at,entities (hashtags are in entities.hashtags).",
        "Search access depends on your X API plan.",
    ],
});
