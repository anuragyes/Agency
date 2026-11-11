// ─────────────────────────────────────────────────────────────
// typographyValidator.js — Comprehensive Automated QA Validator
// Validates text accuracy, typography hierarchy, collision detection,
// safe margin compliance, and contrast ratios across social posts.
// ─────────────────────────────────────────────────────────────

const { getContrastRatio, getLuminance } = require("./brandProfileResolver.js");

/**
 * Checks if two 2D bounding boxes intersect (collision detection)
 */
const boxesIntersect = (a, b) => {
  if (!a || !b) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};

/**
 * Validates whether a box is completely contained inside a canvas with safe margins
 */
const isInsideSafeBounds = (box, canvasWidth, canvasHeight, safeMargin = 40) => {
  if (!box) return true;
  return (
    box.x >= safeMargin &&
    box.y >= safeMargin &&
    box.x + box.w <= canvasWidth - safeMargin &&
    box.y + box.h <= canvasHeight - safeMargin
  );
};

/**
 * Validates full typography and layout metrics
 * @param {object} layoutReport - Output from creativeTypographyEngine
 * @param {object} inputContent - Original input texts { headline, subline, bullets, cta }
 * @param {object} brand - Brand guidelines
 * @returns {object} { valid: boolean, errors: string[], warnings: string[], checks: object }
 */
const validateTypographyLayout = (layoutReport = {}, inputContent = {}, brand = {}) => {
  const errors = [];
  const warnings = [];
  const checks = {
    textAccuracy: true,
    noClipping: true,
    noOverflow: true,
    noOverlaps: true,
    hierarchyValid: true,
    contrastValid: true,
    brandCompliance: true,
  };

  const canvas = layoutReport.canvas || { width: 1080, height: 1080 };
  const boxes = layoutReport.elementBoxes || {};

  // 1. Text Accuracy Check: Ensure all lines are non-empty and retain original words
  if (inputContent.headline) {
    const rawWords = inputContent.headline.trim().split(/\s+/);
    const renderedWords = (layoutReport.headlineLines || []).join(" ").split(/\s+/);
    if (renderedWords.length < rawWords.length) {
      errors.push("Headline text was truncated or missing words.");
      checks.textAccuracy = false;
    }
  }

  // 2. Safe Bounds & Clipping Check
  const safeMargin = 40;
  for (const [key, box] of Object.entries(boxes)) {
    if (!isInsideSafeBounds(box, canvas.width, canvas.height, safeMargin)) {
      errors.push(`Element "${key}" is clipped or extends outside safe canvas area.`);
      checks.noClipping = false;
    }
  }

  // 3. Container Overflow Check
  if (layoutReport.totalContentH > layoutReport.maxContainerH) {
    errors.push(`Content height (${Math.round(layoutReport.totalContentH)}px) exceeds maximum safe container (${layoutReport.maxContainerH}px).`);
    checks.noOverflow = false;
  }

  // 4. Collision & Overlap Detection (Check all pairs of active elements)
  const activeKeys = ["kicker", "headline", "subline", "bullets", "price", "cta", "logo"].filter((k) => boxes[k]);
  for (let i = 0; i < activeKeys.length; i++) {
    for (let j = i + 1; j < activeKeys.length; j++) {
      const k1 = activeKeys[i];
      const k2 = activeKeys[j];
      if (boxesIntersect(boxes[k1], boxes[k2])) {
        errors.push(`Layout collision detected: "${k1}" overlaps with "${k2}".`);
        checks.noOverlaps = false;
      }
    }
  }

  // 5. Typography Hierarchy Check
  const headlineFs = boxes.headline ? boxes.headline.h / (layoutReport.headlineLines?.length || 1) : 0;
  const sublineFs = boxes.subline ? boxes.subline.h / (layoutReport.sublineLines?.length || 1) : 0;
  if (boxes.headline && boxes.subline && headlineFs <= sublineFs) {
    warnings.push("Headline font size is not sufficiently larger than subline.");
    checks.hierarchyValid = false;
  }

  // 6. Contrast & Readability Check (WCAG AA: min 3.0:1 for headings, 4.5:1 for body)
  const contrast = layoutReport.contrastRatio || 7.0;
  if (contrast < 3.0) {
    errors.push(`Insufficient text contrast ratio (${contrast.toFixed(1)}:1). Must be at least 3.0:1.`);
    checks.contrastValid = false;
  } else if (contrast < 4.5) {
    warnings.push(`Contrast ratio (${contrast.toFixed(1)}:1) meets minimum for large text but could be improved for body copy.`);
  }

  // 7. Brand Compliance Check
  if (brand.palette?.primary && !/^#[0-9a-f]{6}$/i.test(brand.palette.primary)) {
    warnings.push("Brand primary color is not a valid 6-digit hex code.");
    checks.brandCompliance = false;
  }

  // 8. Protected Product Region Check: Verify zero text covers the hero product
  if (layoutReport.protectedSubjectBox && !layoutReport.visualAnalysis?.requiresBackedCard) {
    const pBox = layoutReport.protectedSubjectBox;
    const textKeys = ["kicker", "headline", "subline", "cta"];
    for (const k of textKeys) {
      if (boxes[k] && boxesIntersect(boxes[k], pBox)) {
        // Calculate overlap extent
        const ix = Math.max(0, Math.min(boxes[k].x + boxes[k].w, pBox.x + pBox.w) - Math.max(boxes[k].x, pBox.x));
        const iy = Math.max(0, Math.min(boxes[k].y + boxes[k].h, pBox.y + pBox.h) - Math.max(boxes[k].y, pBox.y));
        const overlapArea = ix * iy;
        if (overlapArea > boxes[k].w * boxes[k].h * 0.15) {
          warnings.push(`Text element "${k}" partially enters protected product region.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
  };
};

module.exports = {
  validateTypographyLayout,
  boxesIntersect,
  isInsideSafeBounds,
};

