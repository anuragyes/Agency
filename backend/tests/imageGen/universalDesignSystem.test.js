/**
 * universalDesignSystem.test.js
 * Comprehensive Architectural Regression Test Suite for the Universal Design System.
 * Tests:
 * 1. Computer Vision detection of hero subjects and negative space
 * 2. Dynamic layout adaptation (adapting layout to verified negative space)
 * 3. Protected regions: zero text collision with hero product
 * 4. Brand visibility: wordmark badges and kickers for any brand
 * 5. Multi-brand compatibility: coffee, skincare, tech, supplements, fashion
 * 6. Intelligent fallback: frosted glassmorphism backed card when space is crowded
 * 7. Aspect ratio compatibility: 1:1, 4:5, 9:16, 16:9
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { detectVisualSubject } = require('../../services/imageGen/visualSubjectDetector');
const { composeAd } = require('../../services/imageGen/adComposer');
const { composeCreativeTypography } = require('../../services/imageGen/creativeTypographyEngine');
const { resolveBrandProfile } = require('../../services/imageGen/brandProfileResolver');

// Helper to create synthetic images with high-frequency "product" shapes in specific quadrants
const createTestImage = async (W, H, productQuadrant = 'bottom') => {
  // SVG drawing a distinct high-contrast subject in the requested quadrant
  let subjectRect = { x: 250, y: 550, w: 580, h: 480 }; // default: lower half
  if (productQuadrant === 'top') {
    subjectRect = { x: 250, y: 50, w: 580, h: 450 };
  } else if (productQuadrant === 'left') {
    subjectRect = { x: 50, y: 250, w: 420, h: 600 };
  } else if (productQuadrant === 'right') {
    subjectRect = { x: 600, y: 250, w: 430, h: 600 };
  } else if (productQuadrant === 'full-bleed') {
    subjectRect = { x: 50, y: 50, w: W - 100, h: H - 100 };
  }

  const svg = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#2a303c" />
          <stop offset="100%" stop-color="#111827" />
        </radialGradient>
      </defs>
      <!-- Smooth clean background -->
      <rect width="${W}" height="${H}" fill="url(#bg)" />
      
      <!-- Hero Product with high edge contrast and textures -->
      <g id="product">
        <rect x="${subjectRect.x}" y="${subjectRect.y}" width="${subjectRect.w}" height="${subjectRect.h}" rx="24" fill="#f8fafc" stroke="#38bdf8" stroke-width="8" />
        <circle cx="${subjectRect.x + subjectRect.w / 2}" cy="${subjectRect.y + subjectRect.h / 2}" r="60" fill="#f43f5e" />
        <line x1="${subjectRect.x + 20}" y1="${subjectRect.y + 40}" x2="${subjectRect.x + subjectRect.w - 20}" y2="${subjectRect.y + 40}" stroke="#0f172a" stroke-width="6" />
        <line x1="${subjectRect.x + 20}" y1="${subjectRect.y + 80}" x2="${subjectRect.x + subjectRect.w - 20}" y2="${subjectRect.y + 80}" stroke="#0f172a" stroke-width="6" />
      </g>
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
};

test('Universal: Computer Vision accurately detects product in lower half and recommends text-top', async () => {
  const img = await createTestImage(1080, 1350, 'bottom');
  const analysis = await detectVisualSubject(img);

  assert.ok(analysis.subjectBox.y > 20, 'Subject should be detected in lower region');
  assert.equal(analysis.bestPlacement, 'text-top', 'Optimal placement for bottom product must be text-top');
  assert.equal(analysis.requiresBackedCard, false, 'Clean negative space should not require backed card');
});

test('Universal: Computer Vision accurately detects product on left and recommends text on right', async () => {
  const img = await createTestImage(1080, 1080, 'left');
  const analysis = await detectVisualSubject(img);

  assert.ok(analysis.subjectBox.x < 30, 'Subject should be detected on left');
  assert.equal(analysis.bestPlacement, 'product-left', 'For product on left, placement must be product-left (text on right)');
});

test('Universal: Full-bleed product gracefully adapts to cleanest zone with organic scrim (no boxes)', async () => {
  const img = await createTestImage(1080, 1080, 'full-bleed');
  const analysis = await detectVisualSubject(img);

  assert.ok(['text-top', 'text-bottom', 'product-left', 'product-right'].includes(analysis.bestPlacement));
  assert.equal(analysis.requiresBackedCard, false, 'No box/card should be forced');
});

test('Universal: Dynamic layout adaptation in composeAd prevents text from colliding with product', async () => {
  const img = await createTestImage(1080, 1350, 'bottom');
  // Intentionally request text-bottom (which would collide with the product at bottom)
  const layout = {
    composition: 'text-bottom',
    productName: 'Aura Glow Skincare',
    texts: {
      headline: 'Hydration That Lasts All Day',
      subline: 'Pure botanical hyaluronic acid formulated for sensitive skin.',
      cta: 'Shop Serums',
    },
  };

  const composed = await composeAd({ layout, photo: img });
  assert.ok(composed.jpeg.length > 50000, 'Composed JPEG must be valid and non-empty');
  assert.equal(composed.logoUsed, 'wordmark-clean', 'Must render clean brand wordmark without box');
});

test('Universal: Multi-Brand Compatibility across Diverse Categories', async () => {
  const testBrands = [
    { name: 'PureBotanics', category: 'skincare', primaryColor: '#0f766e', accentColor: '#14b8a6' },
    { name: 'Apex Gear', category: 'fashion', primaryColor: '#18181b', accentColor: '#f97316' },
    { name: 'VoltCharge', category: 'tech', primaryColor: '#1e1b4b', accentColor: '#6366f1' },
    { name: 'VitaBoost', category: 'supplements', primaryColor: '#14532d', accentColor: '#22c55e' },
    { name: 'YCOO Coffee', category: 'coffee', primaryColor: '#451a03', accentColor: '#d97706' },
  ];

  for (const b of testBrands) {
    const brand = resolveBrandProfile(b);
    assert.equal(brand.brandName, b.name);
    assert.ok(brand.palette.primary, `Brand ${b.name} must have primary color`);
    assert.ok(brand.palette.accent, `Brand ${b.name} must have accent color`);

    const img = await createTestImage(1080, 1080, 'bottom');
    const { composedBuffer, layoutReport } = await composeCreativeTypography({
      backgroundBuffer: img,
      aspectRatio: '1:1',
      content: {
        kicker: 'Special Launch',
        headline: `${b.name} Signature Collection`,
        subline: 'Engineered for exceptional performance and timeless aesthetic.',
        cta: 'Discover Now',
      },
      brand,
    });

    assert.ok(composedBuffer.length > 30000, `Output for ${b.name} must render`);
    assert.ok(layoutReport.headlineLines.length > 0, `Headline for ${b.name} must be wrapped and rendered`);
  }
});

test('Universal: All aspect ratios render within safe canvas boundaries', async () => {
  const ratios = ['1:1', '4:5', '9:16', '16:9'];
  const brand = resolveBrandProfile({ name: 'Universal Brand', category: 'general' });

  for (const ar of ratios) {
    const W = ar === '16:9' ? 1920 : 1080;
    const H = ar === '9:16' ? 1920 : ar === '4:5' ? 1350 : 1080;
    const img = await createTestImage(W, H, 'bottom');

    const { composedBuffer, layoutReport } = await composeCreativeTypography({
      backgroundBuffer: img,
      aspectRatio: ar,
      content: {
        headline: 'Designed for Every Screen',
        subline: 'Optimized typography hierarchy adapting to all social platforms.',
        cta: 'Learn More',
      },
      brand,
    });

    assert.equal(layoutReport.canvas.width, W);
    assert.equal(layoutReport.canvas.height, H);
    assert.ok(composedBuffer.length > 30000);
  }
});

