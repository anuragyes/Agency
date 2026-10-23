// Threads — NOT CONNECTED YET. Add explore() to make it live (see instagram.js + buildHashtagResult.js).
const { defineProvider } = require("../providerContract.js");

module.exports = defineProvider({
    id: "threads",
    name: "Threads",
    source: "Threads API",
    envVars: ["THREADS_ACCESS_TOKEN"],
    apiDocs: "https://developers.facebook.com/docs/threads",
    notes: [
        "Check the Threads API keyword / topic search endpoint and its permissions in the current Meta docs.",
    ],
});
