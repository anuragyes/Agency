// LinkedIn — NOT CONNECTED YET. Add explore() to make it live (see instagram.js + buildHashtagResult.js).
const { defineProvider } = require("../providerContract.js");

module.exports = defineProvider({
    id: "linkedin",
    name: "LinkedIn",
    source: "LinkedIn API",
    envVars: ["LINKEDIN_ACCESS_TOKEN"],
    apiDocs: "https://learn.microsoft.com/en-us/linkedin/",
    notes: [
        "LinkedIn has no open hashtag search API; access to post data needs an approved LinkedIn partner program.",
    ],
});
