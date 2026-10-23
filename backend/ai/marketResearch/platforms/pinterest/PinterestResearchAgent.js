// ─────────────────────────────────────────────────────────────
// PinterestResearchAgent.js — Pinterest Research (diagram row 2, box 5)
// Pinterest = visual SEARCH + planning. Users save ideas weeks before they buy,
// so seasonal timing and keyword-rich pins matter more than followers.
// ─────────────────────────────────────────────────────────────
const { createResearchAgent } = require("../../BaseResearchAgent");

const PinterestResearchAgent = createResearchAgent({
    platform: "pinterest",
    label: "Pinterest",
    focus: [
        "Does the product have a visual, aspirational or 'ideas' angle (recipes, decor, outfits, gifts, DIY)?",
        "Search keywords for pin titles, descriptions and board names",
        "Board ideas that group the product with related ideas",
        "Pin formats: standard pins, idea/video pins, product pins, infographics",
        "Seasonal / planning moments when people search for this kind of product",
        "Competitor pins and boards (only from supplied data)",
        "Content gaps in Pinterest search for this niche",
    ],
    rules: [
        "Keywords matter more than hashtags on Pinterest: give 10+ keywords, max 5 hashtags.",
    ],
});

module.exports = PinterestResearchAgent;
