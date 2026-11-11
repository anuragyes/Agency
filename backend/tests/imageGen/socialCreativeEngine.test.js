// ─────────────────────────────────────────────────────────────
// socialCreativeEngine.test.js — Comprehensive Automated Test Suite
// Covers Typography Validation, Alignment & Spacing, Brand Consistency,
// Quality Scoring, Auto-Correction, and Aspect Ratios (1:1, 4:5, 9:16, 16:9).
// Run with: node --test backend/tests/imageGen/socialCreativeEngine.test.js
// ─────────────────────────────────────────────────────────────

const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const { resolveBrandProfile, getContrastRatio } = require("../../services/imageGen/brandProfileResolver.js");
const { sanitizeVisualPrompt, STRICT_NEGATIVE_PROMPT } = require("../../services/imageGen/promptSanitizer.js");
const { composeCreativeTypography, wrapTextToWidth, CANVAS_SPECS } = require("../../services/imageGen/creativeTypographyEngine.js");
const { validateTypographyLayout, boxesIntersect, isInsideSafeBounds } = require("../../services/imageGen/typographyValidator.js");
const { evaluateQualityScore, CATEGORY_WEIGHTS } = require("../../services/imageGen/qualityScorer.js");
const { renderWithAutoCorrection } = require("../../services/imageGen/autoCorrector.js");

// Helper to create a solid color test background image buffer
const createTestImageBuffer = (width, height, color = "#2e1c14") => {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .jpeg()
    .toBuffer();
};

/* ─────────────────────────────────────────────────────────────
   1. PROMPT SANITIZER TESTS (LAYER 1 SEPARATION)
   ───────────────────────────────────────────────────────────── */
test("PromptSanitizer: strips text instructions, quotes, and slogans from diffusion prompt", () => {
  const rawPrompt = 'Debunking Coffee Myths graphic with "Myth #1: Coffee is Dehydrating" and facts with bullet points, high-end photography of coffee beans and cup on white marble';
  const result = sanitizeVisualPrompt(rawPrompt, { aspectRatio: "1:1", brandName: "Artisan Roast" });

  // Slogans and "bullet points" must be stripped
  assert.ok(!result.visualPrompt.includes("Debunking Coffee Myths"));
  assert.ok(!result.visualPrompt.includes("Myth #1"));
  assert.ok(!result.visualPrompt.includes("bullet points"));

  // Photographic instructions and strict negative prompt must be present
  assert.ok(result.visualPrompt.includes("commercial advertising photography"));
  assert.ok(result.visualPrompt.includes("no text or typography"));
  assert.equal(result.negativePrompt, STRICT_NEGATIVE_PROMPT);
});

/* ─────────────────────────────────────────────────────────────
   2. BRAND PROFILE RESOLVER TESTS
   ───────────────────────────────────────────────────────────── */
test("BrandResolver: resolves category palette and respects custom brand overrides", () => {
  // Test Coffee category auto-palette
  const coffeeBrand = resolveBrandProfile({ aiProfile: { name: "Kaffa Coffee", category: "Coffee & Beverage" } });
  assert.equal(coffeeBrand.palette.primary, "#2c1810");

  // Test Custom User Brand Palette override
  const customBrand = resolveBrandProfile({
    aiProfile: { name: "TechNova", category: "SaaS" },
    brandKit: { primary: "#003366", accent: "#ff6600" },
  });
  assert.equal(customBrand.palette.primary, "#003366");
  assert.equal(customBrand.palette.accent, "#ff6600");
  assert.ok(customBrand.getContrastRatio("#003366", "#ffffff") >= 4.5);
});

/* ─────────────────────────────────────────────────────────────
   3. TYPOGRAPHY & WRAPPING TESTS
   ───────────────────────────────────────────────────────────── */
test("TypographyEngine: text wrapping respects max pixel container width", () => {
  const text = "Separating Fact from Fiction in Modern Daily Coffee Drinking Habits";
  const lines = wrapTextToWidth(text, 400, 32, null);

  assert.ok(lines.length >= 2, "Text should wrap into multiple lines");
  assert.equal(lines.join(" "), text, "All original words must be preserved with exact spelling");
});

test("TypographyEngine: Indian currency symbol (₹) and numbers are accurately rendered", async () => {
  const bg = await createTestImageBuffer(1080, 1080, "#1f2937");
  const content = {
    kicker: "Special Offer",
    headline: "Premium Roasted Coffee Beans",
    subline: "Farm fresh beans delivered to your doorstep",
    price: "₹499 (Save 20%)",
    cta: "Order Now",
  };
  const brand = { palette: { primary: "#111827", accent: "#e11d48" } };

  const { composedBuffer, layoutReport } = await composeCreativeTypography({
    backgroundBuffer: bg,
    aspectRatio: "1:1",
    content,
    brand,
  });

  assert.ok(Buffer.isBuffer(composedBuffer));
  assert.ok(layoutReport.elementBoxes.price, "Price element must have a defined bounding box");
  assert.ok(layoutReport.elementBoxes.price.w >= 140, "Price badge must fit ₹ symbol and amount");
});

/* ─────────────────────────────────────────────────────────────
   4. ASPECT RATIO COVERAGE TESTS (1:1, 4:5, 9:16, 16:9)
   ───────────────────────────────────────────────────────────── */
test("TypographyEngine: renders all standard aspect ratios inside safe bounds", async () => {
  const aspectRatios = ["1:1", "4:5", "9:16", "16:9"];

  for (const ratio of aspectRatios) {
    const spec = CANVAS_SPECS[ratio];
    const bg = await createTestImageBuffer(spec.width, spec.height, "#18181b");
    const content = {
      kicker: `${ratio} Format`,
      headline: "Responsive Creative Typography",
      subline: "Safe margins and crisp contrast across all social placements",
      cta: "Explore More",
    };

    const { composedBuffer, layoutReport } = await composeCreativeTypography({
      backgroundBuffer: bg,
      aspectRatio: ratio,
      content,
    });

    const meta = await sharp(composedBuffer).metadata();
    assert.equal(meta.width, spec.width, `Width must match ${ratio} specification`);
    assert.equal(meta.height, spec.height, `Height must match ${ratio} specification`);

    const validation = validateTypographyLayout(layoutReport, content, {});
    assert.equal(validation.checks.noClipping, true, `${ratio} elements must stay within safe canvas boundaries`);
    assert.equal(validation.checks.noOverlaps, true, `${ratio} elements must not collide`);
  }
});

/* ─────────────────────────────────────────────────────────────
   5. COLLISION & OVERLAP DETECTION TESTS
   ───────────────────────────────────────────────────────────── */
test("Validator: collision detector accurately flags overlapping boxes", () => {
  const boxA = { x: 100, y: 100, w: 200, h: 100 };
  const boxB = { x: 150, y: 150, w: 200, h: 100 }; // Intersects boxA
  const boxC = { x: 400, y: 100, w: 200, h: 100 }; // Cleanly disjoint

  assert.equal(boxesIntersect(boxA, boxB), true, "Colliding boxes must be detected");
  assert.equal(boxesIntersect(boxA, boxC), false, "Disjoint boxes must not flag an overlap");
});

test("Validator: safe bounds validator flags clipping elements", () => {
  const insideBox = { x: 80, y: 80, w: 900, h: 200 };
  const clippedBox = { x: 20, y: 80, w: 1050, h: 200 }; // Left edge is 20, extends to 1070

  assert.equal(isInsideSafeBounds(insideBox, 1080, 1080, 40), true);
  assert.equal(isInsideSafeBounds(clippedBox, 1080, 1080, 40), false);
});

/* ─────────────────────────────────────────────────────────────
   6. QUALITY SCORING TESTS
   ───────────────────────────────────────────────────────────── */
test("QualityScorer: calculates weighted score and enforces rejection on critical failures", () => {
  const mockReport = {
    canvas: { width: 1080, height: 1080 },
    contrastRatio: 8.5,
    totalContentH: 400,
    maxContainerH: 700,
  };

  // Clean validation -> Excellent Score
  const cleanValidation = {
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      textAccuracy: true,
      noClipping: true,
      noOverflow: true,
      noOverlaps: true,
      hierarchyValid: true,
      contrastValid: true,
      brandCompliance: true,
    },
  };

  const brand = { palette: { primary: "#0f172a", accent: "#3b82f6" } };
  const cleanScore = evaluateQualityScore(mockReport, cleanValidation, brand);

  assert.ok(cleanScore.score >= 90, `Clean layout must score >= 90, got ${cleanScore.score}`);
  assert.equal(cleanScore.rejected, false);
  assert.equal(cleanScore.rating, "Excellent");

  // Collision error -> Critical Failure & Rejection
  const collisionValidation = {
    valid: false,
    errors: ["Layout collision detected: headline overlaps with cta."],
    warnings: [],
    checks: {
      ...cleanValidation.checks,
      noOverlaps: false,
    },
  };

  const failedScore = evaluateQualityScore(mockReport, collisionValidation, brand);
  assert.equal(failedScore.rejected, true, "Critical failure must reject the layout");
  assert.ok(failedScore.score < 70, `Rejected score must be < 70, got ${failedScore.score}`);
});

/* ─────────────────────────────────────────────────────────────
   7. AUTO-CORRECTION LOOP TESTS
   ───────────────────────────────────────────────────────────── */
test("AutoCorrector: automatically repairs overflow by downscaling font size", async () => {
  const bg = await createTestImageBuffer(1080, 1080, "#1e293b");
  const excessivelyLongContent = {
    kicker: "Comprehensive Scientific Guide",
    headline: "Supercalifragilistic Research Findings on Human Cardiovascular and Neurological Wellness Patterns",
    subline: "A detailed 50-year longitudinal study evaluating hydration benefits and cellular antioxidant mechanisms across diverse global demographics",
    bullets: [
      "Key Finding One: Daily consumption provides active Polyphenols and Chlorogenic Acids for vascular elasticity",
      "Key Finding Two: Mild diuretic tolerance normalizes after consecutive consistent hydration intake",
      "Key Finding Three: Cognitive alert focus parameters optimize without metabolic crash spikes",
    ],
    cta: "Download Full Scientific Report Today",
  };

  const { finalBuffer, layoutReport, qualityScore, correctionsApplied } = await renderWithAutoCorrection({
    backgroundBuffer: bg,
    aspectRatio: "1:1",
    content: excessivelyLongContent,
    initialOverrides: { preventFit: true, headlineFs: 80 },
  });

  assert.ok(Buffer.isBuffer(finalBuffer));
  assert.ok(layoutReport.totalContentH <= layoutReport.maxContainerH, "Auto-corrector must ensure content fits inside container");
  assert.ok(correctionsApplied.length > 0, "Auto-corrector must record applied repairs");
  assert.equal(qualityScore.rejected, false, "Auto-corrected image must achieve a passing quality score");
});
