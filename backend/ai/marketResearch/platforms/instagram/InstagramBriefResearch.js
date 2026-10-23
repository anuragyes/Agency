// ─────────────────────────────────────────────────────────────
// InstagramBriefResearch.js — Studio STEP 5: the Instagram researcher gets the JSON from step 3
//   brief.importantWords ->  official Instagram Graph API (top + last-24h posts)
//   -> real hashtags creators use right now next to those topics.
// NO LLM call here: the brief already holds audience / angle / key points,
// so we only add what the LLM can't know — live Instagram data. 0 tokens.
// ─────────────────────────────────────────────────────────────
const { researchProductHashtags } = require("../../../../services/instagramHashtagResearchService.js");

const MAX_HASHTAGS = 30;
// engagement-bait / generic tags that never help a product post
const SPAM = new Set([
    "#explore", "#explorepage", "#explorepage✨", "#viral", "#viralpost", "#viralreels", "#trending", "#trendingreels",
    "#fyp", "#foryou", "#foryoupage", "#reels", "#reelsinstagram", "#reelitfeelit", "#instagood", "#instagram",
    "#instadaily", "#photooftheday", "#follow", "#followme", "#followforfollow", "#followforfollowback", "#f4f",
    "#like4like", "#likeforlikes", "#l4l", "#likes", "#comment", "#love",
]);

/** Brand / product names: a new brand ("Ycoo") has ~0 Instagram posts -> don't spend weekly quota on it */
const brandNames = (brief, productProfile) => {
    const p = productProfile?.aiProfile || productProfile || {};
    return [brief?.product?.name, brief?.productName, p.name, p.brand, p.brandName]
        .filter((v) => typeof v === "string" && v.trim());
};

/**
 * @param {Object} args
 * @param {Object} args.brief           from ContentBriefAgent (platform "instagram")
 * @param {Object} [args.productProfile] fallback seeds (product keywords) when the brief seeds find nothing
 * @param {Function} [args.onProgress]  progress snapshots ({ stage, seeds, partialHashtags, ... }) — used by the queue worker
 * @returns compact research object (stored on the post and sent to the post writer)
 */
const researchInstagramFromBrief = async ({ brief, productProfile = {}, onProgress } = {}) => {
    if (!brief || typeof brief !== "object") throw new Error("brief is required");

    // the important words from step 2 are what we search on Instagram (most important first)
    const seeds = [...(brief.importantWords || []), ...(brief.hashtagSeeds || []), ...(brief.keywords || [])];
    const data = await researchProductHashtags({ keywords: productProfile?.keywords || [], category: "" }, {
        seedHashtags: seeds,
        excludeSeeds: brandNames(brief, productProfile),
        onProgress: onProgress && ((p) => onProgress({
            ...p,
            partialHashtags: (p.partialHashtags || []).filter((h) => !SPAM.has(String(h).toLowerCase())).slice(0, 10),
        })),
    });

    const hashtags = (data.hashtags || [])
        .filter((h) => h?.hashtag && !SPAM.has(String(h.hashtag).toLowerCase()))
        .slice(0, MAX_HASHTAGS)
        .map(({ hashtag, posts, topPosts, recentPosts24h, avgLikes, avgComments }) => ({ hashtag, posts, topPosts, recentPosts24h, avgLikes, avgComments }));

    return {
        mode: "brief",
        platform: "instagram",
        source: data.source || "instagram_graph_api",
        status: hashtags.length ? data.status : "unavailable",
        fetchedAt: data.fetchedAt,
        mediaAnalyzed: data.mediaAnalyzed || 0,
        timings: data.timings,
        seeds: (data.seeds || []).map(({ hashtag, status, found, topPosts, recentPosts24h, avgTopPostEngagement, fromCache, error, note }) =>
            ({ hashtag, status, found, topPosts, recentPosts24h, avgTopPostEngagement, fromCache, error, note })),
        hashtags,
        limitations: data.limitations || [],
    };
};

module.exports = researchInstagramFromBrief;
module.exports.SPAM_HASHTAGS = SPAM;
