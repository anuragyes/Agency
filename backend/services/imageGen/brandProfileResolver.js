// ─────────────────────────────────────────────────────────────
// brandProfileResolver.js — Dynamic Brand Guidelines Resolver
// Resolves brand colors, fonts, logos, and styling per brand/product
// without hardcoding fixed colors for all customers.
// ─────────────────────────────────────────────────────────────

const DEFAULT_BRAND_PALETTE = {
  primary: "#1e293b",    // Deep slate primary
  secondary: "#475569",  // Slate secondary
  accent: "#5b4cf6",     // Sociva signature purple accent
  background: "#ffffff", // Pure white
  surface: "#f8fafc",    // Ultra-light slate surface
};

const CATEGORY_PALETTES = {
  coffee: { primary: "#2c1810", secondary: "#5c3d2e", accent: "#c67d5a", background: "#fdfbf7", surface: "#f5ece3" },
  beverage: { primary: "#1a365d", secondary: "#2b6cb0", accent: "#319795", background: "#f7fafc", surface: "#ebf8ff" },
  tech: { primary: "#0f172a", secondary: "#334155", accent: "#3b82f6", background: "#ffffff", surface: "#f1f5f9" },
  wellness: { primary: "#134e4a", secondary: "#047857", accent: "#10b981", background: "#f0fdf4", surface: "#ecfdf5" },
  food: { primary: "#7c2d12", secondary: "#9a3412", accent: "#ea580c", background: "#fffaf0", surface: "#ffedd5" },
  education: { primary: "#1e3a8a", secondary: "#1d4ed8", accent: "#f59e0b", background: "#ffffff", surface: "#eff6ff" },
  fitness: { primary: "#18181b", secondary: "#27272a", accent: "#ef4444", background: "#ffffff", surface: "#f4f4f5" },
  beauty: { primary: "#4a044e", secondary: "#86198f", accent: "#d946ef", background: "#fdf4ff", surface: "#fae8ff" },
};

/**
 * Validates whether a hex color string is a valid #RRGGBB
 */
const isValidHex = (hex) => typeof hex === "string" && /^#[0-9a-fA-F]{6}$/i.test(hex.trim());

/**
 * Normalizes hex string
 */
const cleanHex = (hex, fallback) => (isValidHex(hex) ? hex.trim().toLowerCase() : fallback);

/**
 * Calculates relative luminance of a hex color (0.0 - 1.0) per WCAG
 */
const getLuminance = (hex) => {
  const c = cleanHex(hex, "#000000").replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const a = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};

/**
 * Calculates contrast ratio between two hex colors (1.0 to 21.0)
 */
const getContrastRatio = (hex1, hex2) => {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const bright = Math.max(lum1, lum2);
  const dark = Math.min(lum1, lum2);
  return (bright + 0.05) / (dark + 0.05);
};

/**
 * Resolves full brand guidelines for a product profile
 */
const resolveBrandProfile = (product = {}, options = {}) => {
  const profile = product?.aiProfile || product || {};
  const brandName = profile.name || product.name || "Brand";
  const category = (profile.category || "").toLowerCase();

  // 1. Pick category palette or default
  let matchedPalette = DEFAULT_BRAND_PALETTE;
  for (const [key, pal] of Object.entries(CATEGORY_PALETTES)) {
    if (category.includes(key) || brandName.toLowerCase().includes(key)) {
      matchedPalette = pal;
      break;
    }
  }

  // 2. Override with custom product brand colors if stored
  const custom = product?.brandKit || profile?.brandKit || options?.brandKit || {};
  const palette = {
    primary: cleanHex(custom.primary || custom.primaryColor, matchedPalette.primary),
    secondary: cleanHex(custom.secondary || custom.secondaryColor, matchedPalette.secondary),
    accent: cleanHex(custom.accent || custom.accentColor, matchedPalette.accent),
    background: cleanHex(custom.background, matchedPalette.background),
    surface: cleanHex(custom.surface, matchedPalette.surface),
  };

  // 3. Resolve typography font pair
  const allowedPairs = ["brand", "modern-sans", "bold-geometric", "elegant-serif", "friendly-rounded", "editorial", "impact-condensed"];
  let fontPair = custom.fontPair || profile.fontPair || options.fontPair || "modern-sans";
  if (!allowedPairs.includes(fontPair)) {
    fontPair = "modern-sans";
  }

  // 4. Resolve logo assets
  const logoUrl = product.logoUrl || profile.logoUrl || null;
  const iconUrl = product.iconUrl || profile.iconUrl || null;
  const photoUrl = product.photoUrl || profile.photoUrl || null;

  const logoCorner = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(custom.logoCorner)
    ? custom.logoCorner
    : "top-left";

  return {
    brandName,
    category: profile.category || "General",
    tagline: profile.positioning || profile.description || "",
    palette,
    fontPair,
    logoUrl,
    iconUrl,
    photoUrl,
    logoCorner,
    getLuminance,
    getContrastRatio,
  };
};

module.exports = {
  resolveBrandProfile,
  getLuminance,
  getContrastRatio,
  DEFAULT_BRAND_PALETTE,
  CATEGORY_PALETTES,
};

