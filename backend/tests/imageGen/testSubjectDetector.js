const path = require('path');
const fs = require('fs');
const { detectVisualSubject } = require('../../services/imageGen/visualSubjectDetector');

async function testDetector() {
  const testImages = [
    path.join(__dirname, '../../uploads/campaign_test/1_organic_trust.jpg'),
    path.join(__dirname, '../../uploads/campaign_test/2_morning_lifestyle.jpg'),
    path.join(__dirname, '../../uploads/campaign_test/3_premium_benefits.jpg'),
  ];

  for (const imgPath of testImages) {
    if (fs.existsSync(imgPath)) {
      const buf = fs.readFileSync(imgPath);
      const res = await detectVisualSubject(buf);
      console.log(`\nImage: ${path.basename(imgPath)}`);
      console.log('Subject Box (percent):', res.subjectBox);
      console.log('Subject Area Share:', res.metrics.subjectAreaShare + '%');
      console.log('Negative Space Scores:', res.negativeSpaceScore);
      console.log('Best Placement:', res.bestPlacement);
      console.log('Recommended Theme:', res.recommendedTheme);
      console.log('Requires Backed Card:', res.requiresBackedCard);
    }
  }
}

testDetector().catch(console.error);

