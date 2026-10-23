// ─────────────────────────────────────────────────────────────
// FacebookResearchAgent.js — Facebook Research (diagram row 2, box 3)
// Facebook = communities (Groups), Marketplace, older/family audiences, strong ads targeting.
// ─────────────────────────────────────────────────────────────
const { createResearchAgent } = require("../../BaseResearchAgent");

const FacebookResearchAgent = createResearchAgent({
    platform: "facebook",
    label: "Facebook",
    focus: [
        "Audience segments by life stage, location and interests (useful later for ad targeting)",
        "Community opportunities: types of Facebook Groups where buyers of this product gather",
        "Facebook Marketplace / Shop suitability for this product and price",
        "Content formats: video, Reels, photo posts, Lives, events, offers",
        "Competitor pages and their post types (only from supplied data)",
        "Trust signals the audience needs (reviews, demos, guarantees, local presence)",
        "Content gaps and engagement opportunities",
    ],
    rules: [
        "Hashtags are weak on Facebook: suggest at most 3.",
        "Mention audience-targeting ideas as recommendations, not as data.",
    ],
});

module.exports = FacebookResearchAgent;
