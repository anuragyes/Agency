// Pinterest — NOT CONNECTED YET. Add explore() to make it live (see instagram.js + buildHashtagResult.js).
const { defineProvider } = require("../providerContract.js");

module.exports = defineProvider({
    id: "pinterest",
    name: "Pinterest",
    source: "Pinterest API v5",
    envVars: ["PINTEREST_ACCESS_TOKEN"],
    apiDocs: "https://developers.pinterest.com/docs/api/v5/",
    notes: [
        "Pinterest is keyword-driven more than hashtag-driven; its Trends endpoints return trending keywords per region.",
        "Map trending keywords to the HashtagResult shape (posts can be empty when the API has no post-level data).",
    ],
});
