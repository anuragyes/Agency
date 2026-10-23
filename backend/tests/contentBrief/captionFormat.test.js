// captionFormat.test.js — Instagram captions must be plain text (no Markdown stars)
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanText, normalizeInstagramPost, buildFinalCaption } = require("../../ai/marketResearch/platforms/instagram/InstagramPostValidator.js");

const MESSY = `🌟 Elevate your skincare routine with our HydraGlow Face Serum. 

💧 Packed with key ingredients that provide pure hydration naturally.   



✨ **Key Ingredients:**  
- **Hyaluronic Acid:** Instantly hydrates and plumps skin.  
- **Vitamin E:** Promotes skin elasticity.  
* *Botanical Extracts:* Soothe and nourish.

## Why you'll love it

Discover the power of hydration with LUMÉA. :** `;

test("removes Markdown but keeps words, emojis and paragraphs", () => {
    const out = cleanText(MESSY);
    assert.ok(!out.includes("*"), out);
    assert.ok(!out.includes("##"), out);
    assert.ok(!/\n{3,}/.test(out), "max one empty line");
    assert.match(out, /^✨ Key Ingredients:$/m);
    assert.match(out, /^• Hyaluronic Acid: Instantly hydrates and plumps skin\.$/m);
    assert.match(out, /^• Botanical Extracts: Soothe and nourish\.$/m);
    assert.match(out, /^Why you'll love it$/m);
    assert.ok(out.endsWith("Discover the power of hydration with LUMÉA."), out);
});

test("keeps hashtags, plain asterisks like *T&C and normal text untouched", () => {
    assert.equal(cleanText("Glow on ✨\n\n#skincare tip"), "Glow on ✨\n\n#skincare tip");
    assert.equal(cleanText("Free shipping*T&C apply"), "Free shipping*T&C apply");
    assert.equal(cleanText("Save this for later 💾"), "Save this for later 💾");
});

test("normalize + final caption are clean (also carousel slides)", () => {
    const post = normalizeInstagramPost({
        hook: "**Thirsty skin?**", caption: MESSY, hashtags: ["#skincare"], callToAction: "**Shop now**",
        carousel: { slides: [{ headline: "**Slide 1**", body: "- **Tip:** drink water" }] },
        visual: { brief: "serum bottle" },
    }, "carousel");
    assert.equal(post.hook, "Thirsty skin?");
    assert.equal(post.callToAction, "Shop now");
    assert.equal(post.carousel.slides[0].headline, "Slide 1");
    assert.equal(post.carousel.slides[0].body, "• Tip: drink water");
    assert.ok(!buildFinalCaption(post).includes("*"));
    assert.ok(buildFinalCaption({ caption: "Old **draft**", hashtags: ["#a1"] }).startsWith("Old draft"));
});
