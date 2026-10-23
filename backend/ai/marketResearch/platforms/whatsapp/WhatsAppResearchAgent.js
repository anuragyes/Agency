// ─────────────────────────────────────────────────────────────
// WhatsAppResearchAgent.js — WhatsApp Research (diagram row 2, box 4)
// WhatsApp is NOT a public feed: no discovery, no hashtags. It is 1-to-1 / opt-in
// messaging (Catalog, Broadcast lists, Status, Channels, Click-to-WhatsApp ads).
// Very important in India for D2C and local businesses.
// ─────────────────────────────────────────────────────────────
const { createResearchAgent } = require("../../BaseResearchAgent");

const WhatsAppResearchAgent = createResearchAgent({
    platform: "whatsapp",
    label: "WhatsApp",
    focus: [
        "Is this product a good fit for conversational selling (questions before buying, repeat purchases)?",
        "WhatsApp Business Catalog: how to present the product",
        "Broadcast / Channel message ideas: offers, restock alerts, tips — without spamming",
        "WhatsApp Status content ideas",
        "Customer journey: discovery on other platforms -> Click-to-WhatsApp -> order -> repeat",
        "Customer pain points and FAQs that quick replies should answer",
        "Opt-in, consent and anti-spam requirements (put these in risks)",
    ],
    rules: [
        "contentInsights.hashtags MUST be [] (WhatsApp has no hashtag discovery).",
        "Always add opt-in / consent / message frequency risks to 'risks'.",
    ],
});

module.exports = WhatsAppResearchAgent;
