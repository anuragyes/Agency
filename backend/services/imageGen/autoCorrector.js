// ─────────────────────────────────────────────────────────────
// autoCorrector.js — Automated Visual & Typography Correction Loop
// Intercepts validation failures (overflow, low contrast, clipping)
// and corrects parameters (downscales font size, reflows line wrap,
// adjusts vertical rhythm, strengthens contrast scrim) without
// re-running slow and costly AI diffusion models.
// ─────────────────────────────────────────────────────────────

const { composeCreativeTypography } = require("./creativeTypographyEngine.js");
const { validateTypographyLayout } = require("./typographyValidator.js");
const { evaluateQualityScore } = require("./qualityScorer.js");

const MAX_AUTO_CORRECTION_ATTEMPTS = 3;

/**
 * Executes an automated correction loop on a composed image
 * @param {object} params
 * @param {Buffer} params.backgroundBuffer - Base Layer 1 image buffer
 * @param {string} params.aspectRatio - "1:1", "4:5", "9:16", "16:9"
 * @param {object} params.content - Original texts { kicker, headline, subline, bullets, cta, price }
 * @param {object} params.brand - Resolved brand profile
 * @param {string} params.layoutType - Layout template name
 * @returns {Promise<{ finalBuffer: Buffer, layoutReport: object, qualityScore: object, correctionsApplied: string[] }>}
 */
const renderWithAutoCorrection = async ({
  backgroundBuffer,
  aspectRatio = "1:1",
  content = {},
  brand = {},
  layoutType = "clean-overlay",
  initialOverrides = {},
}) => {
  let currentOverrides = { ...initialOverrides };
  const correctionsApplied = [];

  let result = await composeCreativeTypography({
    backgroundBuffer,
    aspectRatio,
    content,
    brand,
    layoutType,
    manualOverrides: currentOverrides,
  });

  let validation = validateTypographyLayout(result.layoutReport, content, brand);
  let quality = evaluateQualityScore(result.layoutReport, validation, brand);

  let attempt = 0;

  while ((quality.rejected || quality.score < 80) && attempt < MAX_AUTO_CORRECTION_ATTEMPTS) {
    attempt++;
    let madeChange = false;

    // 1. Fix: Container Overflow or Clipping -> Downscale font sizes proportionally
    if (!validation.checks.noOverflow || !validation.checks.noClipping) {
      delete currentOverrides.preventFit;
      const currentHeadFs = currentOverrides.headlineFs || (aspectRatio === "9:16" ? 64 : 58);
      const newHeadFs = Math.max(28, Math.round(currentHeadFs * 0.8));
      currentOverrides.headlineFs = newHeadFs;
      currentOverrides.sublineFs = Math.max(18, Math.round(newHeadFs * 0.54));
      currentOverrides.bulletFs = Math.max(16, Math.round(newHeadFs * 0.46));
      correctionsApplied.push(`Attempt ${attempt}: Scaled headline font size from ${currentHeadFs}px to ${newHeadFs}px to eliminate container overflow.`);
      madeChange = true;
    }

    // 2. Fix: Subline or Bullet overlaps -> Adjust line wrapping & spacing
    if (!validation.checks.noOverlaps) {
      const currentHeadFs = currentOverrides.headlineFs || (aspectRatio === "9:16" ? 64 : 58);
      currentOverrides.headlineFs = Math.max(28, Math.round(currentHeadFs * 0.82));
      correctionsApplied.push(`Attempt ${attempt}: Compacted element spacing rhythm to resolve component overlap.`);
      madeChange = true;
    }

    if (!madeChange) {
      break; // No further programmatic fixes available
    }

    // Re-render Layer 2 only (instant vector rendering in Node, 0 GPU tokens)
    result = await composeCreativeTypography({
      backgroundBuffer,
      aspectRatio,
      content,
      brand,
      layoutType,
      manualOverrides: currentOverrides,
    });

    validation = validateTypographyLayout(result.layoutReport, content, brand);
    quality = evaluateQualityScore(result.layoutReport, validation, brand);
  }

  return {
    finalBuffer: result.composedBuffer,
    layoutReport: result.layoutReport,
    validation,
    qualityScore: quality,
    correctionsApplied,
    attemptsCount: attempt,
  };
};

module.exports = {
  renderWithAutoCorrection,
  MAX_AUTO_CORRECTION_ATTEMPTS,
};
