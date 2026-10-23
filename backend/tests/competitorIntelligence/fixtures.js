// Fake but realistic Instagram data for the competitor intelligence tests (coffee category)
// deterministic pseudo random
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const CAPTIONS = [
    ["How to brew the perfect pour over at home? 3 steps ☕ #coffee #pourover #brewguide", "reel"],
    ["New cold brew cans are here! Shop now, link in bio #coldbrew #coffee", "image"],
    ["Behind the scenes: our roast day at the farm #coffeefarm #roastery #coffee", "carousel"],
    ["POV: Monday morning without coffee #coffeememes #mondaymood", "reel"],
    ["5 benefits of single origin beans — save this #specialtycoffee #coffee", "carousel"],
    ["Diwali gift boxes 20% off with code DIWALI #coffeegifts #diwali", "image"],
    ["Our customers said it best ❤ #review #coffeelovers", "image"],
];
const makeAccount = (username, followers, quality, n = 14) => ({
    profile: { username, name: username.replace(/_/g, " "), followers, biography: "Specialty coffee roasters", mediaCount: 300 },
    recentPosts: Array.from({ length: n }, (_, i) => {
        const [caption, fmt] = CAPTIONS[(i + username.length) % CAPTIONS.length];
        const boost = fmt === "reel" ? 2.2 : fmt === "carousel" ? 1.6 : 1;
        const likes = Math.round(followers * 0.02 * quality * boost * (0.6 + rnd()));
        const comments = Math.round(likes * (caption.includes("?") ? 0.09 : 0.03));
        const ts = new Date(Date.UTC(2026, 9, 12) - i * 2.3 * 86400000 + (i % 3) * 3600000 * 5).toISOString();
        return {
            id: `${username}_${i}`, caption, likes, comments, engagement: likes + comments,
            mediaType: fmt === "carousel" ? "CAROUSEL_ALBUM" : fmt === "reel" ? "VIDEO" : "IMAGE", productType: fmt === "reel" ? "REELS" : "FEED",
            timestamp: ts, permalink: `https://instagram.com/p/${username}_${i}`, imageUrl: null,
            hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()),
        };
    }),
});

const brand = { name: "Ycoo Coffee", category: "Food & Beverage > Coffee", keywords: ["coffee", "cold brew", "filter coffee"], benefits: ["fresh roasted"], uses: ["morning brew"], targetAudience: ["young professionals"] };
const raw = [makeAccount("brew_one", 50000, 1.2), makeAccount("bean_co", 8000, 1), makeAccount("roast_lab", 200000, 0.6), makeAccount("cup_culture", 15000, 0.9)];
const meRaw = makeAccount("ycoo_coffee", 3000, 0.7, 8);
meRaw.recentPosts.forEach((p) => { p.caption = p.caption.replace(/#\w+/g, "") + " #ycoo"; p.hashtags = ["#ycoo"]; p.mediaType = "IMAGE"; p.productType = "FEED"; });
const ownComments = [
    { mediaId: "m1", text: "What is the price of the cold brew?", username: "a" },
    { mediaId: "m1", text: "Love it 😍 best coffee", username: "b" },
    { mediaId: "m1", text: "Where can I buy this in Pune?", username: "c" },
    { mediaId: "m2", text: "Order not received yet, very late", username: "d" },
    { mediaId: "m2", text: "@friend", username: "e" },
    { mediaId: "m2", text: "how much for 250g?", username: "f" },
    { mediaId: "m3", text: "Please bring a decaf", username: "g" },
];


module.exports = { brand, raw, meRaw, ownComments, makeAccount };
