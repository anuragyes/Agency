const path = require('path');
const fs = require('fs');
const { detectVisualSubject } = require('../../services/imageGen/visualSubjectDetector');

async function testUserImages() {
  const images = [
    'C:/Users/pc/.gemini/antigravity/brain/e5baf064-8f97-4e27-ae25-c36c9005c04f/.user_uploaded/media_1794379590960_bc12f72f.jpg',
    'C:/Users/pc/.gemini/antigravity/brain/e5baf064-8f97-4e27-ae25-c36c9005c04f/.user_uploaded/media_1794379636036_4642dd00.jpg',
  ];

  for (const img of images) {
    if (fs.existsSync(img)) {
      const buf = fs.readFileSync(img);
      const res = await detectVisualSubject(buf);
      console.log(`\nUser Image: ${path.basename(img)}`);
      console.log('Subject Box:', res.subjectBox);
      console.log('Best Placement:', res.bestPlacement);
      console.log('Requires Backed Card:', res.requiresBackedCard);
      console.log('Luminance Map:', res.luminanceMap);
    }
  }
}

testUserImages().catch(console.error);

