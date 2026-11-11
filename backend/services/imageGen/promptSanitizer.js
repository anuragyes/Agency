// ─────────────────────────────────────────────────────────────
// promptSanitizer.js — Layer 1 Visual Prompt Generator & Sanitizer
// Strips text requests, bullet points, headlines and typography
// instructions from AI diffusion prompts, guaranteeing Layer 1
// generates pure, pristine photographic scenes with negative copy-space.
// ─────────────────────────────────────────────────────────────

const TEXT_INSTRUCTION_PATTERNS = [
  /["'“‘][^"'”’]{2,}["'”’]/g, // Quoted slogans or phrases like "Debunking Coffee Myths"
  /\b(?:debunking|myths?|facts?|tips?|tricks?|secrets?|guide|lesson|rules?|breakdown)\b[^,.;:]*/gi,
  /\b(?:text|words?|letters?|typography|headline|subline|heading|caption|title|slogan|quote|phrase|tagline|subheading|bullet points?)\b[^,.;:]*/gi,
  /\b(?:with|reading|showing|displaying|having|saying|spelling|written)\s+(?:the\s+)?(?:text|words?|phrase|title|label|headline)\b[^,.;:]*/gi,
  /\b(?:myth\s*#?\d+|fact\s*#?\d+|tip\s*#?\d+)\b[^,.;:]*/gi,
  /\b(?:₹|\$|€|£)\s*\d+[^,.;:]*/gi, // Price expressions
  /\b(?:save|off|discount|sale|offer)\s+\d+%\b[^,.;:]*/gi,
  /\b(?:swipe\s+left|learn\s+more|click\s+here|shop\s+now|order\s+now|cta\s+button)\b[^,.;:]*/gi,
  /\b(?:do\s+not|never)\s+(?:add|render|write|include)\s+(?:text|letters|words)\b[^,.;:]*/gi,
];

const STRICT_NEGATIVE_PROMPT =
  "text, typography, letters, words, writing, numbers, symbols, logo, watermark, signature, label text, headline, title, caption, button, banner, distorted characters, blurry, deformed, cartoon, illustration, low resolution, jpeg artifacts";

/**
 * Sanitizes a raw prompt by stripping textual instructions and retaining purely visual scene elements.
 * @param {string} rawPrompt
 * @param {object} options { composition, emptyArea, aspectRatio, productProfile }
 * @returns {{ visualPrompt: string, negativePrompt: string, emptyArea: string }}
 */
const sanitizeVisualPrompt = (rawPrompt = "", options = {}) => {
  let cleaned = String(rawPrompt || "").trim();

  // 1. Remove text instruction patterns
  for (const pattern of TEXT_INSTRUCTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // 2. Remove layout talk
  cleaned = cleaned
    .replace(/\b(?:copy[\s-]?space|negative space|safe zone|empty area|clean space)\b[^,.;:]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

  // If prompt was almost entirely text instructions, construct a clean photographic fallback
  const brandName = options.brandName || options.productProfile?.name || "Product";
  const category = options.category || options.productProfile?.category || "lifestyle";

  if (!cleaned || cleaned.length < 8) {
    cleaned = `Commercial advertising product photography for ${brandName} in a modern ${category} setting, aesthetic composition`;
  }

  // 3. Determine empty copy-space area according to composition
  const composition = options.composition || (options.aspectRatio === "9:16" ? "text-top" : "text-top");
  let emptyAreaInstruction = "clean negative space in upper third for commercial composition";
  if (composition === "text-bottom" || composition === "flatlay") {
    emptyAreaInstruction = "clean negative space in lower third with soft focus";
  } else if (composition === "product-left") {
    emptyAreaInstruction = "subject placed on left side, clean softly lit negative space on the right side";
  } else if (composition === "product-right") {
    emptyAreaInstruction = "subject placed on right side, clean softly lit negative space on the left side";
  }

  // 4. Formulate the high-end photographic prompt
  const visualPrompt = [
    cleaned,
    "commercial advertising photography",
    "professional studio lighting",
    emptyAreaInstruction,
    "sharp focus on subject",
    "soft natural background falloff",
    "8k resolution",
    "no text or typography",
  ].join(", ");

  return {
    visualPrompt,
    negativePrompt: STRICT_NEGATIVE_PROMPT,
    emptyArea: emptyAreaInstruction,
  };
};

module.exports = {
  sanitizeVisualPrompt,
  STRICT_NEGATIVE_PROMPT,
  TEXT_INSTRUCTION_PATTERNS,
};
