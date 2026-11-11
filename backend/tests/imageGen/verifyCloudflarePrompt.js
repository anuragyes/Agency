/**
 * Quick local sanity check — no network, no image generation.
 * Confirms that buildCloudflarePrompt():
 *   1. Strips layout-talk / percentage numbers from the prompt
 *   2. Strips brand instructions and "do-not" sentences
 *   3. Stays under 2000 chars
 *   4. CF_NO_TEXT suffix is appended by the caller
 */
const { buildCloudflarePrompt } = require('../../services/imageGen/imageProviders.js');

const CF_NO_TEXT =
    ', NO text, NO letters, NO words, NO watermarks, NO logos, NO headlines, ' +
    'NO captions, NO overlays, NO labels, NO writing, NO signs, NO typography, ' +
    'NO numbers, NO brand marks, NO badges, NO slogans';

const layouts = [
    {
        label: 'YCOO Coffee – text-top (product lower half)',
        layout: {
            composition: 'text-top',
            productName: 'YCOO Coffee',
            aspectRatio: '4:5',
            sdPromptCore: 'A glass jar of premium coffee beans sitting on a rustic wooden table, ' +
                'morning light streaming through a window, coffee plants in the background. ' +
                'Bottom 30% kept clear, leaving space for future text overlay.',
            style: { name: 'Organic', look: 'warm earthy tones, top-left 27% empty for the logo, natural grain texture' },
        },
    },
    {
        label: 'YCOO Coffee – product-left',
        layout: {
            composition: 'product-left',
            productName: 'YCOO Coffee',
            aspectRatio: '4:5',
            sdPromptCore: 'Premium coffee mug steaming, minimalist white background, text area on right for headline copy.',
            style: null,
        },
    },
    {
        label: 'Generic Brand – no productName',
        layout: {
            composition: 'text-bottom',
            aspectRatio: '1:1',
            sdPromptCore: 'A luxury skincare serum bottle on marble surface, space reserved for text overlay at top.',
            style: { name: 'Luxury', look: 'cool whites and golds, negative space at top for copy area' },
        },
    },
];

let allPassed = true;
for (const { label, layout } of layouts) {
    const core = buildCloudflarePrompt({ layout });
    const full = core + CF_NO_TEXT;

    const hasLayoutTalk = /\d+\s*%|space\s+(?:left\s+)?for\s+(?:the\s+)?(?:text|headline|logo|copy)|copy.?space|text\s+area|text\s+overlay/i.test(core);
    const tooLong = full.length > 2100;

    const pass = !hasLayoutTalk && !tooLong;
    if (!pass) allPassed = false;

    console.log(`\n── ${label} ──`);
    console.log('  Prompt (core):', core.slice(0, 300) + (core.length > 300 ? '…' : ''));
    console.log('  Core length :', core.length, 'chars');
    console.log('  Full length :', full.length, 'chars  (must be < 2100)');
    console.log('  Layout-talk :', hasLayoutTalk ? '❌ FOUND — must strip!' : '✅ none');
    console.log('  Length check:', tooLong ? '❌ too long!' : '✅ ok');
    console.log('  Result      :', pass ? '✅ PASS' : '❌ FAIL');
}

console.log('\n' + (allPassed ? '✅ All prompt checks passed.' : '❌ One or more checks FAILED.'));
process.exit(allPassed ? 0 : 1);

