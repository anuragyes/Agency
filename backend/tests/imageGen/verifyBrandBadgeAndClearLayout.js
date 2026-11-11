const assert = require('assert');
const sharp = require('sharp');
const { composeAd } = require('../../services/imageGen/adComposer');
const { textOverlaySvg, layoutText } = require('../../services/imageGen/layoutRenderer');

async function test() {
  console.log('Testing brand name and clear layout...');

  const layout = {
    composition: 'text-top',
    productName: 'YCOO Coffee',
    productShape: 'jar',
    texts: {
      headline: 'Great Coffee Starts with Quality Sourcing.',
      subline: 'Carefully sourced. Naturally inspired. Unforgettable in every sip.',
      cta: 'Discover Your Perfect Cup.',
    },
    palette: { background: '#ffffff', surface: '#f0f0f0', accent: '#e63946' },
  };

  // 1. Verify textOverlaySvg renders brand kicker
  const svg = textOverlaySvg(layout, 1080, 1350, { theme: 'light' });
  assert.ok(svg.includes('data-role="kicker"'), 'Kicker group must be present in SVG');
  assert.ok(svg.includes('YCOO COFFEE'), 'Brand name must be present in kicker');
  console.log('✅ Kicker correctly rendered in textOverlaySvg: YCOO COFFEE');

  // 2. Verify composeAd renders wordmark badge when logo is null
  const dummyBg = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 200, g: 200, b: 200 } }
  }).png().toBuffer();

  const out = await composeAd({ layout, photo: dummyBg, logo: null });
  assert.equal(out.logoUsed, 'wordmark-clean', 'Wordmark should be clean typography without box');
  console.log('✅ composeAd automatically generated clean wordmark for brand (no box)');

  // 3. Verify side composition (product-left and product-right)
  const leftLayout = { ...layout, composition: 'product-left' };
  const L_left = layoutText(leftLayout, 1080, 1350);
  assert.ok(L_left.box.x > 500, 'Text box on product-left must be on right side');

  const rightLayout = { ...layout, composition: 'product-right' };
  const L_right = layoutText(rightLayout, 1080, 1350);
  assert.ok(L_right.box.x < 200, 'Text box on product-right must be on left side');
  console.log('✅ Side compositions correctly placed');

  console.log('All brand & layout tests passed successfully!');
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

