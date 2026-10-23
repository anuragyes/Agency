// TikTok — NOT CONNECTED YET. Add explore() to make it live (see instagram.js + buildHashtagResult.js).
const { defineProvider } = require("../providerContract.js");

module.exports = defineProvider({
    id: "tiktok",
    name: "TikTok",
    source: "TikTok API",
    envVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    apiDocs: "https://developers.tiktok.com/",
    notes: [
        "Hashtag / video search is offered through TikTok's Research API, which needs an approved application.",
        "Check the current TikTok developer docs for which product gives your app access to hashtag data.",
    ],
});
