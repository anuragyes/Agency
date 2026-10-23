// ─────────────────────────────────────────────────────────────
// services/hashtags — one place for REAL hashtag data from every social platform.
//
//   GET  /api/hashtags/platforms              which platforms exist / are live
//   POST /api/hashtags/:platform/explore      { seeds }            -> "Find real hashtags"
//   GET  /api/hashtags/:platform/quota        API searches used (if the platform has a limit)
//
// Add a new platform:
//   1. create providers/<id>.js with defineProvider({...})  (see providerContract.js)
//   2. add it to PROVIDERS below (the order here is the order of the buttons in the UI)
//   3. implement explore() with the platform's real API -> it turns LIVE in the UI
// ─────────────────────────────────────────────────────────────
const { HashtagApiError } = require("./providerContract.js");

const PROVIDERS = [
    require("./providers/instagram.js"),
    require("./providers/youtube.js"),
    require("./providers/tiktok.js"),
    require("./providers/x.js"),
    require("./providers/threads.js"),
    require("./providers/pinterest.js"),
    require("./providers/facebook.js"),
    require("./providers/linkedin.js"),
];

const byId = new Map(PROVIDERS.map((p) => [p.id, p]));

const getProvider = (platform) => {
    const p = byId.get(String(platform || "").toLowerCase());
    if (!p) throw new HashtagApiError(`Unknown platform "${platform}". Use one of: ${[...byId.keys()].join(", ")}`, 404, "UNKNOWN_PLATFORM");
    return p;
};

const listPlatforms = () => PROVIDERS.map((p) => p.info());

module.exports = { getProvider, listPlatforms, HashtagApiError };
