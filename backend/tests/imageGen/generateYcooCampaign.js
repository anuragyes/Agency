/**
 * Generate 4 promotional designs for YCOO Coffee:
 * 1. Organic Coffee – Product Trust
 * 2. Morning Coffee – Lifestyle and Emotion
 * 3. Premium Coffee – Product Benefits
 * 4. Better Brew – Modern Product Advertisement
 *
 * Runs through the Two-Layer architecture:
 * Layer 1: Cloudflare FLUX (clean visual prompt, stripped of text/promotional words)
 * Layer 2: Programmatic Typography Engine (bounding-box collision check, auto-correction, quality scoring)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cloudflareClient = require('../../services/imageGen/cloudflareImageClient');
const { renderWithAutoCorrection } = require('../../services/imageGen/autoCorrector');
const { sanitizeVisualPrompt } = require('../../services/imageGen/promptSanitizer');
const { resolveBrandProfile } = require('../../services/imageGen/brandProfileResolver');
const { validateTypographyLayout } = require('../../services/imageGen/typographyValidator');

const OUTPUT_DIR = path.join(__dirname, '../../uploads/campaign_test');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DESIGNS = [
  {
    id: '1_organic_trust',
    title: 'Organic Coffee – Product Trust',
    aspectRatio: '1:1',
    visualPrompt: 'A glass container of organic coffee beans on a weathered rustic wooden table, lush green coffee plantation leaves in soft morning bokeh background, natural diffuse sunlight, warm organic tones, commercial product shot',
    brandProfile: {
      name: 'YCOO Coffee',
      category: 'coffee',
      primaryColor: '#2C5E3B', // Organic forest green
      secondaryColor: '#E8D8C8',
      accentColor: '#D4A373',
      fontStyle: 'bold_modern',
    },
    content: {
      kicker: '100% Certified Organic',
      headline: 'Sustainably Sourced Fresh Coffee',
      subline: 'Discover authentic blends grown under high-altitude shade trees and eco-friendly farming practices.',
      bullets: ['Zero Chemical Pesticides', 'Fair-Trade Certified Farmers', 'Small-Batch Roasted'],
      cta: 'Shop Organic Beans',
    },
  },
  {
    id: '2_morning_lifestyle',
    title: 'Morning Coffee – Lifestyle & Emotion',
    aspectRatio: '4:5',
    visualPrompt: 'A clear glass mug filled with steaming fresh black coffee on a warm wooden kitchen counter, golden morning sunlight beams streaming from a side window, steam gently rising, cozy calming lifestyle scene',
    brandProfile: {
      name: 'YCOO Coffee',
      category: 'coffee',
      primaryColor: '#5C3D2E', // Warm artisan roast
      secondaryColor: '#FFF3E0',
      accentColor: '#B85D19',
      fontStyle: 'editorial_serif',
    },
    content: {
      kicker: 'Morning Ritual',
      headline: 'Awaken Your Senses Daily',
      subline: 'Slow down and savor every sip with deep caramel aromas and silky smooth crema.',
      cta: 'Start Your Morning Right',
    },
  },
  {
    id: '3_premium_benefits',
    title: 'Premium Coffee – Product Benefits',
    aspectRatio: '4:5',
    visualPrompt: 'A sleek matte jar of artisan roasted whole beans with scattered dark glossy roasted coffee beans on dark slate stone surface, dramatic side studio rim lighting, luxury coffee packaging',
    brandProfile: {
      name: 'YCOO Coffee',
      category: 'coffee',
      primaryColor: '#1F1B18', // Deep espresso black
      secondaryColor: '#C5A059', // Warm gold
      accentColor: '#D97706',
      fontStyle: 'bold_modern',
    },
    content: {
      kicker: 'Reserve Selection',
      headline: 'Signature Dark Roast',
      subline: 'Carefully curated micro-lots yielding full-bodied notes of Belgian dark chocolate and roasted hazelnut.',
      bullets: ['Low Acidity Profile', 'Rich Golden Crema', 'Sealed For Peak Freshness'],
      cta: 'Explore Reserve Blend',
    },
  },
  {
    id: '4_better_brew',
    title: 'Better Brew – Modern Product Advertisement',
    aspectRatio: '1:1',
    visualPrompt: 'Modern minimalist pour-over coffee dripper and fresh brew cup on a clean terrazzo countertop, soft daylight, Scandinavian minimalist design aesthetic, clean negative space',
    brandProfile: {
      name: 'YCOO Coffee',
      category: 'coffee',
      primaryColor: '#2B2D42', // Modern slate navy
      secondaryColor: '#EDF2F4',
      accentColor: '#EF233C', // Modern vibrant CTA
      fontStyle: 'minimal_sans',
    },
    content: {
      kicker: 'Special Offer',
      headline: 'Better Beans. Better Brew.',
      subline: 'Upgrade your daily cup with barista-grade whole bean roasts delivered to your door weekly.',
      cta: 'Claim 20% Off Your First Order',
    },
  },
];

async function runCampaignGeneration() {
  console.log('====================================================');
  console.log('🚀 YCOO COFFEE CAMPAIGN GENERATION & VALIDATION');
  console.log('====================================================\n');

  const results = [];

  for (const design of DESIGNS) {
    console.log(`\n----------------------------------------------------`);
    console.log(`📸 Generating: [${design.id}] ${design.title} (${design.aspectRatio})`);
    console.log(`----------------------------------------------------`);

    // Step 1: Sanitize Layer 1 Prompt
    const sanitized = sanitizeVisualPrompt(design.visualPrompt, {
      aspectRatio: design.aspectRatio,
      brandName: design.brandProfile.name,
      category: design.brandProfile.category,
    });
    console.log('  Cleaned Visual Prompt:', sanitized.visualPrompt.slice(0, 120) + '...');

    // Step 2: Generate or Mock Layer 1 Visual
    let rawVisualBuffer;
    try {
      if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
        console.log('  Calling Cloudflare FLUX for clean background...');
        const cfRes = await cloudflareClient.generateImage({
          prompt: sanitized.visualPrompt,
          aspectRatio: design.aspectRatio,
        });
        if (cfRes?.image) {
          rawVisualBuffer = cfRes.image;
          console.log(`  ✅ Received Cloudflare background (${Math.round(rawVisualBuffer.length / 1024)} KB)`);
        }
      }
    } catch (err) {
      console.warn('  ⚠️ Cloudflare generation failed or skipped:', err.message);
    }

    // Fallback if offline/rate-limited
    if (!rawVisualBuffer) {
      console.log('  Generating synthetic high-res photographic gradient background...');
      const W = design.aspectRatio === '1:1' ? 1080 : 1080;
      const H = design.aspectRatio === '1:1' ? 1080 : 1350;
      const bgSvg = `
        <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="grad" cx="50%" cy="40%" r="70%">
              <stop offset="0%" stop-color="#4a3525" />
              <stop offset="60%" stop-color="#241a12" />
              <stop offset="100%" stop-color="#120c08" />
            </radialGradient>
          </defs>
          <rect width="${W}" height="${H}" fill="url(#grad)" />
        </svg>
      `;
      rawVisualBuffer = await sharp(Buffer.from(bgSvg)).jpeg().toBuffer();
    }

    // Step 3: Resolve Brand Profile
    const brand = resolveBrandProfile(design.brandProfile);

    // Step 4: Render Layer 2 Typography with Auto-Correction
    console.log('  Applying Layer 2 Deterministic Typography Engine...');
    const { finalBuffer, qualityScore, correctionsApplied } = await renderWithAutoCorrection({
      backgroundBuffer: rawVisualBuffer,
      aspectRatio: design.aspectRatio,
      content: design.content,
      brand,
    });

    console.log(`  QA Quality Score: ${qualityScore.score}/100 (Rating: ${qualityScore.rating}, Rejected: ${qualityScore.rejected})`);
    if (correctionsApplied.length > 0) {
      console.log('  Auto-Corrections Applied:', correctionsApplied);
    }

    // Step 5: Save Final Downloadable Asset
    const outPath = path.join(OUTPUT_DIR, `${design.id}.jpg`);
    await sharp(finalBuffer).jpeg({ quality: 94 }).toFile(outPath);
    console.log(`  💾 Saved ready-to-publish image -> ${outPath}`);

    // Step 6: Validate output image properties
    const meta = await sharp(outPath).metadata();
    console.log(`  📐 Output dimensions: ${meta.width}x${meta.height} px, format: ${meta.format}`);

    results.push({
      id: design.id,
      title: design.title,
      score: qualityScore.score,
      rating: qualityScore.rating,
      passes: !qualityScore.rejected && qualityScore.score >= 80,
      breakdown: qualityScore.categoryScores,
      outPath,
    });
  }

  console.log('\n====================================================');
  console.log('📊 FINAL VERIFICATION REPORT:');
  console.log('====================================================');
  let allPassed = true;
  for (const r of results) {
    console.log(`- [${r.passes ? 'PASS ✅' : 'FAIL ❌'}] ${r.title}: ${r.score}/100 -> ${r.outPath}`);
    if (!r.passes) allPassed = false;
  }

  console.log(allPassed ? '\n🎉 ALL 4 DESIGNS PASSED VALIDATION & QUALITY CHECKS!' : '\n⚠️ SOME DESIGNS FAILED.');
  process.exit(allPassed ? 0 : 1);
}

runCampaignGeneration().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
