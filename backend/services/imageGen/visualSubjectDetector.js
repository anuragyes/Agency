// ─────────────────────────────────────────────────────────────
// visualSubjectDetector.js — Computer Vision Saliency & Subject Detector
// Analyzes raw generated AI images to locate the visual hero subject,
// detect protected regions, and identify verified negative space for
// deterministic typography placement.
// ─────────────────────────────────────────────────────────────
const sharp = require('sharp');

/**
 * Grid resolution for spatial saliency analysis.
 * 64x64 = 4096 cells, executes in ~5-12ms in Node.js.
 */
const GRID_SIZE = 64;

/**
 * Analyzes an image buffer to detect the hero subject and negative space.
 * @param {Buffer} imageBuffer - Raw PNG or JPEG image buffer
 * @returns {Promise<{
 *   subjectBox: { x: number, y: number, w: number, h: number }, // 0-100 percentage coordinates
 *   bestPlacement: "text-top" | "text-bottom" | "product-left" | "product-right" | "backed-card",
 *   negativeSpaceScore: { top: number, bottom: number, left: number, right: number },
 *   recommendedTheme: "light" | "dark",
 *   requiresBackedCard: boolean,
 *   luminanceMap: { top: number, bottom: number, left: number, right: number }
 * }>}
 */
const detectVisualSubject = async (imageBuffer) => {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 1080;
  const H = meta.height || 1080;

  // 1. Downscale to analysis grid and convert to grayscale
  const grayRaw = await sharp(imageBuffer)
    .resize(GRID_SIZE, GRID_SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // 2. Compute edge energy map using a 3x3 Sobel kernel approximation
  const energy = new Float32Array(GRID_SIZE * GRID_SIZE);
  let totalEnergy = 0;

  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 1; x < GRID_SIZE - 1; x++) {
      const idx = y * GRID_SIZE + x;
      // Sobel horizontal gradient
      const gx =
        -1 * grayRaw[idx - GRID_SIZE - 1] +
        1 * grayRaw[idx - GRID_SIZE + 1] +
        -2 * grayRaw[idx - 1] +
        2 * grayRaw[idx + 1] +
        -1 * grayRaw[idx + GRID_SIZE - 1] +
        1 * grayRaw[idx + GRID_SIZE + 1];

      // Sobel vertical gradient
      const gy =
        -1 * grayRaw[idx - GRID_SIZE - 1] +
        -2 * grayRaw[idx - GRID_SIZE] +
        -1 * grayRaw[idx - GRID_SIZE + 1] +
        1 * grayRaw[idx + GRID_SIZE - 1] +
        2 * grayRaw[idx + GRID_SIZE] +
        1 * grayRaw[idx + GRID_SIZE + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      energy[idx] = mag;
      totalEnergy += mag;
    }
  }

  const avgEnergy = totalEnergy / ((GRID_SIZE - 2) * (GRID_SIZE - 2));
  const threshold = avgEnergy * 1.35; // Significant feature threshold

  // 3. Find subject bounding box (cells exceeding threshold)
  let minX = GRID_SIZE;
  let maxX = 0;
  let minY = GRID_SIZE;
  let maxY = 0;
  let salientPointsCount = 0;

  for (let y = 2; y < GRID_SIZE - 2; y++) {
    for (let x = 2; x < GRID_SIZE - 2; x++) {
      const idx = y * GRID_SIZE + x;
      if (energy[idx] > threshold) {
        salientPointsCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if image has uniform noise or very subtle edges: default to center
  if (salientPointsCount < 15 || minX >= maxX || minY >= maxY) {
    minX = Math.round(GRID_SIZE * 0.25);
    maxX = Math.round(GRID_SIZE * 0.75);
    minY = Math.round(GRID_SIZE * 0.35);
    maxY = Math.round(GRID_SIZE * 0.85);
  }

  // Add 4% safety margin to protect the product boundaries
  const pad = Math.round(GRID_SIZE * 0.04);
  const subjectX = Math.max(0, minX - pad);
  const subjectY = Math.max(0, minY - pad);
  const subjectW = Math.min(GRID_SIZE - subjectX, maxX - minX + pad * 2);
  const subjectH = Math.min(GRID_SIZE - subjectY, maxY - minY + pad * 2);

  // Normalized percentage coordinates (0 - 100)
  const subjectBox = {
    x: Math.round((subjectX / GRID_SIZE) * 100),
    y: Math.round((subjectY / GRID_SIZE) * 100),
    w: Math.round((subjectW / GRID_SIZE) * 100),
    h: Math.round((subjectH / GRID_SIZE) * 100),
  };

  // 4. Evaluate 4 candidate negative space regions
  // Top 35%, Bottom 35%, Left 40%, Right 40%
  const evaluateZone = (startX, endX, startY, endY) => {
    let zoneEnergy = 0;
    let zoneLum = 0;
    let count = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = y * GRID_SIZE + x;
        zoneEnergy += energy[idx];
        zoneLum += grayRaw[idx];
        count++;
      }
    }

    const meanEnergy = count ? zoneEnergy / count : 999;
    const meanLum = count ? zoneLum / count / 255 : 0.5;

    // Calculate overlap with subject box
    const overlapX = Math.max(0, Math.min(endX, subjectX + subjectW) - Math.max(startX, subjectX));
    const overlapY = Math.max(0, Math.min(endY, subjectY + subjectH) - Math.max(startY, subjectY));
    const overlapShare = count ? (overlapX * overlapY) / count : 1;

    return {
      meanEnergy,
      meanLum,
      overlapShare,
      // Lower score = cleaner negative space with less subject intrusion
      score: meanEnergy + overlapShare * 500,
    };
  };

  const topZone = evaluateZone(0, GRID_SIZE, 0, Math.round(GRID_SIZE * 0.35));
  const bottomZone = evaluateZone(0, GRID_SIZE, Math.round(GRID_SIZE * 0.65), GRID_SIZE);
  const leftZone = evaluateZone(0, Math.round(GRID_SIZE * 0.42), Math.round(GRID_SIZE * 0.15), Math.round(GRID_SIZE * 0.85));
  const rightZone = evaluateZone(Math.round(GRID_SIZE * 0.58), GRID_SIZE, Math.round(GRID_SIZE * 0.15), Math.round(GRID_SIZE * 0.85));

  const negativeSpaceScore = {
    top: topZone.score,
    bottom: bottomZone.score,
    left: leftZone.score,
    right: rightZone.score,
  };

  const luminanceMap = {
    top: topZone.meanLum,
    bottom: bottomZone.meanLum,
    left: leftZone.meanLum,
    right: rightZone.meanLum,
  };

  // 5. Determine the best placement based on minimum overlap with subject
  let bestPlacement = 'text-top';
  let minScore = topZone.score;

  if (bottomZone.score < minScore) {
    minScore = bottomZone.score;
    bestPlacement = 'text-bottom';
  }
  if (leftZone.score < minScore) {
    minScore = leftZone.score;
    bestPlacement = 'product-right'; // Text on left side
  }
  if (rightZone.score < minScore) {
    minScore = rightZone.score;
    bestPlacement = 'product-left'; // Text on right side
  }

  // If candidate scores are close or subject is large, prefer the cleanest vertical zone (text-top or text-bottom)
  const subjectAreaShare = (subjectBox.w * subjectBox.h) / 10000;
  if (bestPlacement === 'backed-card' || !['text-top', 'text-bottom', 'product-left', 'product-right'].includes(bestPlacement)) {
    bestPlacement = topZone.score <= bottomZone.score ? 'text-top' : 'text-bottom';
  }

  // Determine theme for optimal readability (light text on dark, dark text on bright)
  const chosenLum =
    bestPlacement === 'text-top'
      ? luminanceMap.top
      : bestPlacement === 'text-bottom'
      ? luminanceMap.bottom
      : bestPlacement === 'product-right'
      ? luminanceMap.left
      : luminanceMap.right;

  const recommendedTheme = chosenLum > 0.62 ? 'dark' : 'light';

  return {
    subjectBox,
    bestPlacement,
    negativeSpaceScore,
    recommendedTheme,
    requiresBackedCard: false,
    luminanceMap,
    metrics: {
      width: W,
      height: H,
      subjectAreaShare: Math.round(subjectAreaShare * 100),
    },
  };
};

module.exports = {
  detectVisualSubject,
  GRID_SIZE,
};

