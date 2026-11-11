// ─────────────────────────────────────────────────────────────
// qualityScorer.js — Multi-Dimensional Visual & Typography Quality Scorer
// Computes a weighted 0-100 quality score according to Sociva specifications:
//   - Text accuracy (25%)
//   - Alignment (20%)
//   - Spacing (15%)
//   - Brand consistency (15%)
//   - Visual composition (15%)
//   - Text readability (10%)
// ─────────────────────────────────────────────────────────────

/**
 * Weights per specification
 */
const CATEGORY_WEIGHTS = {
  textAccuracy: 25,
  alignment: 20,
  spacing: 15,
  brandConsistency: 15,
  visualComposition: 15,
  textReadability: 10,
};

/**
 * Evaluates the rendered creative output and generates a comprehensive quality report
 * @param {object} layoutReport - Metrics from creativeTypographyEngine
 * @param {object} validation - Output from typographyValidator
 * @param {object} brand - Brand guidelines
 * @returns {object} { score: number, rating: string, rejected: boolean, categoryScores: object, breakdown: object }
 */
const evaluateQualityScore = (layoutReport = {}, validation = {}, brand = {}) => {
  const categoryScores = {
    textAccuracy: 100,
    alignment: 100,
    spacing: 100,
    brandConsistency: 100,
    visualComposition: 100,
    textReadability: 100,
  };

  const criticalFailures = [];

  // 1. Evaluate Text Accuracy (25%)
  if (!validation.checks?.textAccuracy) {
    categoryScores.textAccuracy = 40;
    criticalFailures.push("Missing or truncated text content.");
  }

  // 2. Evaluate Alignment (20%)
  if (!validation.checks?.noOverlaps) {
    categoryScores.alignment = 30;
    criticalFailures.push("Overlapping elements or collisions detected.");
  }
  if (!validation.checks?.noClipping) {
    categoryScores.alignment = 20;
    criticalFailures.push("Elements extend outside canvas safe area.");
  }

  // 3. Evaluate Spacing (15%)
  if (!validation.checks?.noOverflow) {
    categoryScores.spacing = 40;
    criticalFailures.push("Text overflows designated container bounds.");
  }
  if (!validation.checks?.hierarchyValid) {
    categoryScores.spacing -= 20;
  }

  // 4. Evaluate Brand Consistency (15%)
  if (!validation.checks?.brandCompliance) {
    categoryScores.brandConsistency = 60;
  }
  if (!brand.palette?.primary || !brand.palette?.accent) {
    categoryScores.brandConsistency -= 15;
  }

  // 5. Evaluate Visual Composition (15%)
  if (validation.warnings?.length) {
    categoryScores.visualComposition -= Math.min(30, validation.warnings.length * 10);
  }

  // 6. Evaluate Text Readability (10%)
  const contrast = layoutReport.contrastRatio || 7.0;
  if (!validation.checks?.contrastValid) {
    categoryScores.textReadability = 30;
    criticalFailures.push(`Text contrast ratio too low (${contrast.toFixed(1)}:1).`);
  } else if (contrast < 4.5) {
    categoryScores.textReadability = 75;
  }

  // Calculate Weighted Total Score (0 - 100)
  let totalScore = 0;
  for (const [key, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const raw = Math.max(0, Math.min(100, categoryScores[key]));
    totalScore += (raw * weight) / 100;
  }
  totalScore = Math.round(totalScore);

  // Critical Failure Rule: If any critical failure exists, enforce rejection
  const hasCritical = criticalFailures.length > 0;
  const isRejected = hasCritical || totalScore < 70;
  if (hasCritical && totalScore >= 70) {
    totalScore = 65; // Cap score below 70 to reflect critical failure
  }

  // Determine Classification Rating
  let rating = "Needs Improvement";
  if (totalScore >= 90) rating = "Excellent";
  else if (totalScore >= 80) rating = "Good";
  else if (totalScore >= 70) rating = "Needs Improvement";
  else rating = "Rejected";

  return {
    score: totalScore,
    rating,
    rejected: isRejected,
    criticalFailures,
    categoryScores,
    weights: CATEGORY_WEIGHTS,
    summary: `${rating} (${totalScore}/100) — ${isRejected ? "Requires Auto-Correction" : "Ready for Publishing"}`,
  };
};

module.exports = {
  evaluateQualityScore,
  CATEGORY_WEIGHTS,
};

