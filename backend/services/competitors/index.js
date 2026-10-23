// ─────────────────────────────────────────────────────────────
// services/competitors — competitor research per platform (REAL API data only).
// Instagram + Facebook are live. Add a platform: implement lookup / fetchAccount / fetchMine in
// providers/<id>.js returning the same shape as Instagram (profile + recentPosts) and set implemented: true.
// ─────────────────────────────────────────────────────────────
const instagram = require("./providers/instagram.js");
const facebook = require("./providers/facebook.js");

const soon = (id, name, notes) => ({ id, name, implemented: false, notes });

const PROVIDERS = [
    instagram,
    facebook,
    soon("youtube", "YouTube", ["Possible with the free YouTube Data API v3: any public channel's subscribers, videos, views, likes, comments, tags."]),
    soon("x", "X", ["Possible with the paid X API (pay per use): public profiles and posts."]),
    soon("threads", "Threads", ["Threads API keyword search needs Meta app review."]),
    soon("pinterest", "Pinterest", ["Pinterest API v5 can read public pins / boards (limited on Trial access)."]),
    soon("tiktok", "TikTok", ["TikTok's Research API is for academic / non-profit research only."]),
    soon("linkedin", "LinkedIn", ["LinkedIn has no official API to read other companies' pages."]),
];

const byId = new Map(PROVIDERS.map((p) => [p.id, p]));

const getProvider = (platform, { live = true } = {}) => {
    const p = byId.get(String(platform || "").toLowerCase());
    if (!p) throw Object.assign(new Error(`Unknown platform "${platform}"`), { statusCode: 404 });
    if (live && !p.implemented) throw Object.assign(new Error(`${p.name} competitor research is not connected yet.`), { statusCode: 501 });
    return p;
};

const listPlatforms = () => PROVIDERS.map(({ id, name, implemented, source, searchHint, metrics, notAvailable, notes }) =>
    ({ id, name, implemented, source: source || null, searchHint: searchHint || null, metrics: metrics || [], notAvailable: notAvailable || [], notes: notes || [] }));

module.exports = { getProvider, listPlatforms };
