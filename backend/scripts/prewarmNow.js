// Run the hashtag pre-warm ONCE right now (no queue needed): npm run prewarm
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { prewarmHashtags } = require("../services/hashtagPrewarmService.js");

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const summary = await prewarmHashtags({ onProgress: (p) => console.log(`[Prewarm] ${p.stage} ${p.seeds.map((s) => `${s.hashtag}:${s.status}`).join(" ")}`) });
    console.log(JSON.stringify(summary, null, 2));
    await mongoose.disconnect();
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
