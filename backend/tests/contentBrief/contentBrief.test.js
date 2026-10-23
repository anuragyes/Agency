// node --test tests/contentBrief/contentBrief.test.js
// Studio flow: prompt -> optimized JSON -> (platform) -> Instagram researcher -> post (fake LLM, no network)
const test = require("node:test");
const assert = require("node:assert");
const generateContentBrief = require("../../ai/contentBrief/ContentBriefAgent.js");
const generateInstagramPost = require("../../ai/marketResearch/platforms/instagram/InstagramPostAgent.js");
const buildInstagramPostPrompt = require("../../ai/marketResearch/platforms/instagram/InstagramPostPrompt.js");
const buildInstagramBriefPostPrompt = require("../../ai/marketResearch/platforms/instagram/InstagramBriefPostPrompt.js");

const profile = {
    name: "Gaon Desi Ghee", category: "Food > Dairy > Ghee", description: "A2 cow ghee made with the bilona method in small batches.",
    features: ["A2 Gir cow milk", "Bilona hand-churned", "Glass jar 500ml"], benefits: ["Rich aroma", "Good for daily cooking"],
    uses: ["Roti", "Dal tadka", "Sweets"], targetAudience: ["Health-conscious families", "Home cooks"],
    price: { amount: 899, currency: "INR" }, positioning: "Premium traditional ghee", keywords: ["desi ghee", "a2 ghee", "bilona ghee"],
};

const fakeLlm = (replies) => {
    const calls = [];
    return {
        calls,
        lastUsage: null,
        async generate({ input }) { calls.push(input); return typeof replies === "function" ? replies(input, calls.length) : replies[calls.length - 1]; },
    };
};

const BRIEF_REPLY = JSON.stringify({
    optimizedPrompt: "Write a warm carousel showing why our bilona A2 ghee tastes like grandma's, ending with a comment CTA.",
    importantWords: ["#desi ghee", "a2 ghee", "bilona ghee", "gir cow", "pure ghee"], productName: "Something else",
    audience: "Home cooks in metro cities", goal: "Sales", angle: "Why bilona ghee tastes like grandma's",
    keyPoints: ["Hand-churned bilona method", "A2 Gir cow milk"], facts: ["A2 Gir cow milk", "Bilona hand-churned"],
    tone: "warm, desi", cta: "Comment GHEE for the link", formatHint: "Carousel", language: "Hinglish",
});

test("optimizer: prompt -> optimized prompt + important words JSON (no platform yet)", async () => {
    const llm = fakeLlm([BRIEF_REPLY]);
    const { brief, usage } = await generateContentBrief({ userPrompt: "make a carousel about our ghee", productProfile: profile, llm });
    assert.equal(brief.platform, null);
    assert.match(brief.optimizedPrompt, /bilona/);
    assert.deepEqual(brief.importantWords.slice(0, 2), ["desi ghee", "a2 ghee"]);
    assert.equal(brief.goal, "sales");
    assert.equal(brief.formatHint, "carousel");
    assert.equal(brief.product.name, "Gaon Desi Ghee", "name comes from the saved profile, not the LLM");
    assert.equal(brief.product.price, "INR 899");
    assert.ok(!llm.calls[0].includes("PLATFORM"), "no platform in the optimizer prompt");
    assert.ok(usage.briefTokens > 0 && usage.briefTokens < 250, `JSON is small (${usage.briefTokens} tokens)`);
});

test("optimizer: works without a saved product profile", async () => {
    const { brief } = await generateContentBrief({ userPrompt: "ghee", llm: fakeLlm([BRIEF_REPLY]) });
    assert.equal(brief.product.name, "Something else");
});

test("optimizer: retries once with the validation errors", async () => {
    const llm = fakeLlm(["{\"optimizedPrompt\":\"\"}", BRIEF_REPLY]);
    await generateContentBrief({ userPrompt: "x", productProfile: profile, llm });
    assert.equal(llm.calls.length, 2);
    assert.match(llm.calls[1], /REJECTED/);
});

test("instagram format comes from formatHint", () => {
    const { instagramFormat } = require("../../ai/contentBrief/PlatformBriefSpecs.js");
    assert.equal(instagramFormat("reel"), "reel");
    assert.equal(instagramFormat("short"), "reel");
    assert.equal(instagramFormat("image"), "image");
    assert.equal(instagramFormat(""), "carousel");
});

test("post from brief: small prompt + only live hashtags survive", async () => {
    const { brief } = await generateContentBrief({ userPrompt: "carousel", productProfile: profile, llm: fakeLlm([BRIEF_REPLY]) });
    const research = { mode: "brief", hashtags: [{ hashtag: "#desighee" }, { hashtag: "#a2ghee" }, { hashtag: "#bilonaghee" }, { hashtag: "#gheerecipes" }] };
    const POST = JSON.stringify({
        hook: "Dadi ka ghee, ab jar mein 🫙", caption: "Bilona = hand-churned.\nComment GHEE for the link", hashtags: ["#desighee", "#madeup", "#a2ghee"],
        callToAction: "Comment GHEE", visual: { brief: "Golden ghee in glass jar" },
        carousel: { slides: [{ headline: "a", body: "b" }, { headline: "c", body: "d" }, { headline: "e", body: "f" }, { headline: "g", body: "h" }] },
    });
    const llm = fakeLlm([POST]);
    const stats = {};
    const post = await generateInstagramPost({ brief, research, contentType: "carousel", stats, llm });
    assert.deepEqual(post.hashtags, ["#desighee", "#a2ghee"]);
    assert.ok(!llm.calls[0].includes("PRODUCT PROFILE"), "full profile is not sent");
    assert.ok(llm.calls[0].includes("#gheerecipes"), "live hashtags are sent");

    // compare with the old prompt (full profile + full research JSON)
    const oldResearch = {
        platform: "instagram", productCategory: "Ghee",
        targetAudience: { segments: ["Health-conscious families", "Home cooks", "Fitness people"], interests: ["cooking", "ayurveda"], contentPreferences: ["reels", "recipes"] },
        hashtagResearch: { primary: research.hashtags.map((h) => h.hashtag), niche: [], related: [], verified: research.hashtags.map((h) => ({ ...h, posts: 4, avgLikes: 120 })) },
        contentResearch: { reelIdeas: ["Bilona process", "Dal tadka"], carouselIdeas: ["A2 vs A1", "5 uses"], postIdeas: ["Jar shot"] },
        engagementOpportunities: ["Recipe comments"], recommendations: ["Post reels 3x/week"], researchLimitations: [],
    };
    const oldPrompt = buildInstagramPostPrompt({ productProfile: profile, instagramResearch: oldResearch, contentType: "carousel", userPrompt: "carousel" });
    const newPrompt = buildInstagramBriefPostPrompt({ brief, research, contentType: "carousel", userPrompt: "" });
    const saved = 1 - newPrompt.length / oldPrompt.length;
    console.log(`old post prompt ≈ ${Math.ceil(oldPrompt.length / 4)} tokens, new ≈ ${Math.ceil(newPrompt.length / 4)} tokens (${Math.round(saved * 100)}% less)`);
    assert.ok(saved > 0.4, "brief prompt is much smaller");
});
