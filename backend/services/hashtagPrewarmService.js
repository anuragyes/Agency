// ─────────────────────────────────────────────────────────────
// hashtagPrewarmService.js — keep hashtag data warm so research answers from cache
//
// Runs as a repeatable BullMQ job (workers/worker.js, every PREWARM_EVERY_HOURS).
//   1. USED hashtags  : hashtags research used in the last 7 days -> fetch fresh posts.
//                       Their ids are cached, so this never spends a NEW hashtag search.
//   2. CATEGORY list  : common categories (coffee, skincare...) so the FIRST user of a
//                       category also gets a cache hit. A category that was never searched
//                       spends 1 of Meta's 30 weekly searches — only allowed while more than
//                       PREWARM_QUOTA_RESERVE searches are left (real users come first).
//
// Env (optional):
//   PREWARM_USED_LIMIT=15                 max used hashtags refreshed per run
//   PREWARM_CATEGORY_HASHTAGS=coffee,...  comma list ("none" = off). Default: DEFAULT_CATEGORIES
//   PREWARM_QUOTA_RESERVE=20              keep at least this many weekly searches for users
// ─────────────────────────────────────────────────────────────
const {
    listRecentlyUsedHashtags,
    peekCachedHashtag,
    countHashtagSearchesThisWeek,
    countMetaRecentlySearchedHashtags,
    normalizeHashtag,
    isHashtagApiConfigured,
    HASHTAG_WEEKLY_LIMIT,
} = require("./instagramService.js");
const { collectHashtagData } = require("./instagramHashtagResearchService.js");

const DEFAULT_CATEGORIES = ["coffee", "skincare", "fashion", "fitness", "food", "haircare", "organicfood", "homedecor"];

const categoryList = () => {
    const raw = process.env.PREWARM_CATEGORY_HASHTAGS;
    if (raw && raw.trim().toLowerCase() === "none") return [];
    const list = raw ? raw.split(/[,\s]+/) : DEFAULT_CATEGORIES;
    return [...new Set(list.map(normalizeHashtag).filter((t) => t.length >= 3))];
};

/**
 * @param {Object} [opts]
 * @param {Function} [opts.onProgress]  job.updateProgress
 * @returns summary { usedRefreshed, categoriesWarmed, categoriesSkipped, quota, mediaAnalyzed, ms }
 */
const prewarmHashtags = async ({ onProgress } = {}) => {
    const started = Date.now();
    if (!isHashtagApiConfigured()) return { skipped: "Meta hashtag API is not configured" };

    const usedLimit = Math.max(0, Number(process.env.PREWARM_USED_LIMIT ?? 15));
    const reserve = Math.max(0, Number(process.env.PREWARM_QUOTA_RESERVE ?? 20));

    // 1. hashtags users really used (ids known -> no quota)
    const used = (await listRecentlyUsedHashtags({ limit: usedLimit })).map((h) => h.hashtag);

    // 2. categories: already known ones are free; new ones only while quota allows
    const ours = await countHashtagSearchesThisWeek();
    const metas = await countMetaRecentlySearchedHashtags(); // Meta's own count (null if unavailable)
    let remaining = HASHTAG_WEEKLY_LIMIT - Math.max(ours, metas ?? 0);
    const categoriesWarmed = [];
    const categoriesSkipped = [];
    for (const tag of categoryList()) {
        if (used.includes(tag)) continue;
        const cached = await peekCachedHashtag(tag);
        if (cached?.hashtagId) {
            categoriesWarmed.push(tag);
        } else if (cached?.notFound) {
            continue;
        } else if (remaining > reserve) {
            categoriesWarmed.push(tag);
            remaining--; // collectHashtagData will search it
        } else {
            categoriesSkipped.push(tag);
        }
    }

    const seeds = [...used, ...categoriesWarmed];
    if (!seeds.length) {
        return { usedRefreshed: [], categoriesWarmed: [], categoriesSkipped, quota: { ours, meta: metas, reserve }, ms: Date.now() - started };
    }

    const { mediaAnalyzed, seedStats } = await collectHashtagData(seeds, { mode: "research", prewarm: true, onProgress });
    const summary = {
        usedRefreshed: used,
        categoriesWarmed,
        categoriesSkipped,
        failed: seedStats.filter((s) => s.error).map((s) => `${s.hashtag}: ${s.error}`),
        quota: { ours, meta: metas, reserve },
        mediaAnalyzed,
        ms: Date.now() - started,
    };
    console.log(`[Prewarm] used=${used.length} categories=${categoriesWarmed.length} skipped(quota)=${categoriesSkipped.length} media=${mediaAnalyzed} in ${summary.ms}ms`);
    return summary;
};

module.exports = { prewarmHashtags, categoryList, DEFAULT_CATEGORIES };
