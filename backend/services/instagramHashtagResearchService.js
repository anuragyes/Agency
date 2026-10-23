// ─────────────────────────────────────────────────────────────
// instagramHashtagResearchService.js — REAL, current hashtag data
//
// Before: the LLM "suggested" hashtags from its old training data.
// Now:    seed hashtags -> Instagram Graph API (top posts + last-24h posts, several pages)
//         -> count which hashtags real creators use RIGHT NOW next to those seeds.
//
//   researchProductHashtags(product)  used by the AI research agents (LLM picks only from this list)
//   exploreHashtags({ seeds })        used by the Hashtags page: all hashtags + the real posts
//                                     (likes, comments, link) so the user can see the evidence
//
// Never throws for API problems: returns status "unavailable"/"partial" + limitations.
// ─────────────────────────────────────────────────────────────
const {
    getHashtagId,
    getHashtagMediaDetailed,
    peekCachedHashtag,
    rankCoOccurringHashtags,
    normalizeHashtag,
    isHashtagApiConfigured,
    apiErrorMessage,
    countHashtagSearchesThisWeek,
    HASHTAG_WEEKLY_LIMIT,
} = require("./instagramService.js");
const { toPostView } = require("./instagramInsightsService.js");
const { rankHashtagsWithQuality, removedNote } = require("./hashtags/hashtagQuality.js");
const { mapLimit } = require("./metaClient.js");

// Each NEW seed uses 1 of the 30 hashtag searches per week, so keep this small.
const MAX_SEEDS = Math.max(1, Number(process.env.INSTAGRAM_HASHTAG_SEEDS) || 4);
const MAX_RESULTS = Math.max(5, Number(process.env.INSTAGRAM_HASHTAG_MAX_RESULTS) || 60);
const MAX_EXPLORE_RESULTS = 150;
// Seeds fetched at the same time (each seed = 2 edges -> up to 6 Meta calls in flight, the limiter caps the rest)
const SEED_CONCURRENCY = Math.max(1, Number(process.env.INSTAGRAM_SEED_CONCURRENCY) || 4);
// Time budget: after this, no NEW pages are started (every seed still gets page 1). Meta needs 12–24s per call,
// so this decides "how long do we keep collecting more posts". Data already fetched is never thrown away.
const RESEARCH_BUDGET_MS = Number(process.env.INSTAGRAM_RESEARCH_BUDGET_MS) || 75000;
// Research sample per seed (top + recent together). Floor: keep paging until we have this many (if Meta has them).
// One page = max 50 posts. Default 150 = 2 pages of TOP posts (engagement / hooks / formats) + 1 page of
// RECENT posts (what's active in the last 24h). Before: up to 300 per seed (3 + 3 pages, mostly overlap).
const MIN_POSTS_PER_SEED = Math.max(20, Number(process.env.INSTAGRAM_MIN_POSTS_PER_SEED) || 150);
const TOP_SHARE = 2 / 3;

/**
 * Pick seed hashtags. Order: explicit seeds -> product keywords -> category parts.
 * "organic ghee" -> "organicghee"
 */
const buildSeedHashtags = (product = {}, explicitSeeds = [], max = MAX_SEEDS, exclude = []) => {
    // brand / product names (e.g. a new brand "Ycoo") have ~0 posts on Instagram -> searching them
    // only burns 1 of the 30 weekly searches. They are still used by the post writer, just not searched.
    const skip = new Set((Array.isArray(exclude) ? exclude : [exclude]).map(normalizeHashtag).filter(Boolean));
    const p = product?.aiProfile || product || {};
    const keywords = Array.isArray(p.keywords) ? p.keywords : [];
    const categoryParts = String(p.category || "").split(/[>\/,&|]+/);
    const explicit = (Array.isArray(explicitSeeds) ? explicitSeeds : [explicitSeeds])
        .flatMap((s) => String(s || "").split(/[,#\n]+/));

    const candidates = [...explicit, ...keywords, ...categoryParts]
        .map((c) => String(c || "").trim())
        .filter((c) => c && c.split(/\s+/).length <= 3)   // long phrases are never real hashtags
        .map(normalizeHashtag)
        .filter((c) => c.length >= 3 && c.length <= 30 && !skip.has(c));

    return [...new Set(candidates)].slice(0, max);
};

const quotaInfo = async () => {
    const used = await countHashtagSearchesThisWeek();
    return { used, limit: HASHTAG_WEEKLY_LIMIT, remaining: Math.max(0, HASHTAG_WEEKLY_LIMIT - used) };
};

/**
 * One seed's posts.
 *  research mode: no media_url, ~MIN_POSTS_PER_SEED posts (2/3 top, 1/3 recent; floor protection: page further if fewer)
 *  full mode    : media_url for thumbnails, up to HASHTAG_MAX_PAGES pages per edge (Hashtags page)
 */
const fetchSeedMedia = async (seed, hashtagId, mode, refresh = false, deadline = Infinity) => {
    const edges = ["top_media", "recent_media"];
    const base = { label: `#${seed}`, withMediaUrl: mode === "full", refresh, deadline: mode === "full" ? Infinity : deadline };
    const want = { top_media: Math.ceil(MIN_POSTS_PER_SEED * TOP_SHARE) };
    want.recent_media = MIN_POSTS_PER_SEED - want.top_media;

    const first = await Promise.allSettled(edges.map((edge) =>
        getHashtagMediaDetailed(hashtagId, edge, mode === "full" ? base : { ...base, minPosts: want[edge] })));

    if (mode !== "full") {
        // Floor protection: a niche hashtag may give fewer posts on page 1 -> page further on the edges that have more
        const count = first.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.media.length : 0), 0);
        const deficit = MIN_POSTS_PER_SEED - count;
        if (deficit > 0 && Date.now() < deadline) {
            await Promise.all(first.map(async (r, i) => {
                if (r.status !== "fulfilled" || r.value.complete) return;
                try {
                    // refresh=false here: continue from the page-1 data we just saved
                    r.value = await getHashtagMediaDetailed(hashtagId, edges[i], { ...base, refresh: false, minPosts: r.value.media.length + deficit });
                } catch { /* keep what we have */ }
            }));
        }
    }
    return { top: first[0], recent: first[1] };
};

/**
 * Shared core: resolve every seed's id, then fetch the seeds' posts IN PARALLEL.
 * @param {string[]} seeds
 * @param {Object}   [opts]
 * @param {"research"|"full"} [opts.mode="research"]
 * @param {Function} [opts.onProgress]  called with a progress snapshot after every change (queue job progress)
 * @param {boolean}  [opts.prewarm=false] pre-warm job: ignore the cache (fetch fresh) and don't mark hashtags as used
 */
const collectHashtagData = async (seeds, { mode = "research", onProgress, prewarm = false } = {}) => {
    const t0 = Date.now();
    const limitations = [];
    const state = seeds.map((seed) => ({ hashtag: `#${seed}`, status: "waiting" }));
    const groupsBySeed = new Array(seeds.length).fill(null);

    const report = async (stage) => {
        if (!onProgress) return;
        const groups = groupsBySeed.filter(Boolean).flat();
        const doneSeeds = seeds.filter((_, i) => groupsBySeed[i]);
        try {
            await onProgress({
                stage,
                seeds: state.map((s) => ({ ...s })),
                mediaAnalyzed: groups.reduce((n, g) => n + g.media.length, 0),
                // progressive result: hashtags found so far (the final list is ranked again at the end)
                partialHashtags: groups.length ? rankCoOccurringHashtags(groups, doneSeeds).slice(0, 15).map((h) => h.hashtag) : [],
                elapsedMs: Date.now() - t0,
            });
        } catch (err) {
            console.warn("[HashtagResearch] progress update failed:", err.message);
        }
    };

    // 1. Ids one by one: cached ids cost nothing; a NEW one uses weekly quota, so a limit error must stop cleanly
    await report("resolving");
    const ids = [];
    for (let i = 0; i < seeds.length; i++) {
        state[i].status = "searching";
        try {
            const { hashtagId, fromCache } = await getHashtagId(seeds[i], { markUsed: !prewarm });
            if (!hashtagId) {
                Object.assign(state[i], { status: "not_found", found: false, note: "Hashtag does not exist on Instagram" });
            } else {
                Object.assign(state[i], { status: "waiting", hashtagId, idFromCache: fromCache });
                ids.push(i);
            }
        } catch (err) {
            Object.assign(state[i], { status: err.code === "HASHTAG_WEEKLY_LIMIT" ? "skipped" : "error", found: false, error: apiErrorMessage(err) });
            if (err.code === "HASHTAG_WEEKLY_LIMIT" && !limitations.includes(err.message)) limitations.push(err.message);
        }
    }
    const idsMs = Date.now() - t0;
    await report("fetching");

    // 2. Posts for every found seed, SEED_CONCURRENCY at a time
    await mapLimit(ids, SEED_CONCURRENCY, async (i) => {
        const seed = seeds[i];
        const started = Date.now();
        state[i].status = "fetching";
        await report("fetching");

        const { top, recent } = await fetchSeedMedia(seed, state[i].hashtagId, mode, prewarm, t0 + RESEARCH_BUDGET_MS);
        const topMedia = top.status === "fulfilled" ? top.value.media : [];
        const recentMedia = recent.status === "fulfilled" ? recent.value.media : [];
        groupsBySeed[i] = [
            { seed, edge: "top_media", media: topMedia },
            { seed, edge: "recent_media", media: recentMedia },
        ];

        const engagement = topMedia
            .filter((m) => Number.isFinite(m.like_count) || Number.isFinite(m.comments_count))
            .map((m) => (m.like_count || 0) + (m.comments_count || 0));
        const failedEdge = top.status === "rejected" || recent.status === "rejected";

        Object.assign(state[i], {
            status: failedEdge && !topMedia.length && !recentMedia.length ? "error" : "done",
            found: true,
            topPosts: topMedia.length,
            recentPosts24h: recentMedia.length,   // sampled, max = pages x 50
            posts: topMedia.length + recentMedia.length,
            fromCache: (top.status !== "fulfilled" || top.value.fromCache) && (recent.status !== "fulfilled" || recent.value.fromCache),
            ms: Date.now() - started,
            avgTopPostEngagement: engagement.length
                ? Math.round(engagement.reduce((a, b) => a + b, 0) / engagement.length)
                : null,
            ...(failedEdge && { error: apiErrorMessage(top.reason || recent.reason) }),
        });
        await report("fetching");
    });

    const groups = groupsBySeed.filter(Boolean).flat();
    // same shape as before for the callers (+ fromCache / ms / posts for the progress UI)
    const seedStats = state.map(({ status, ...s }) => ({ found: false, topPosts: 0, recentPosts24h: 0, ...s, status }));

    seedStats.filter((s) => s.error && s.status !== "skipped").forEach((s) => limitations.push(`${s.hashtag}: ${s.error}`));
    seedStats.filter((s) => s.note).forEach((s) => limitations.push(`${s.hashtag}: ${s.note}`));
    limitations.push(
        "Hashtag metrics come from a sample of Instagram top posts and posts from the last 24 hours; they are relative signals, not total hashtag volume. Meta does not share who posted (username) for hashtag posts — open the post link to see the account."
    );

    const mediaAnalyzed = groups.reduce((n, g) => n + g.media.length, 0);
    const timings = { idsMs, fetchMs: Date.now() - t0 - idsMs, totalMs: Date.now() - t0 };
    console.log(`[HashtagResearch] ${mode} seeds=${seeds.length} media=${mediaAnalyzed} ids=${timings.idsMs}ms fetch=${timings.fetchMs}ms total=${timings.totalMs}ms`);

    return {
        groups,
        seedStats,
        limitations,
        mediaAnalyzed,
        timings,
        failed: seedStats.some((s) => s.error),
    };
};

/** For the AI research agents */
/**
 * @param {Object} product
 * @param {Object} [opts]
 * @param {string[]} [opts.seedHashtags]  explicit seeds (most important first)
 * @param {string[]} [opts.excludeSeeds]  brand / product names: never searched (≈0 posts, wastes quota)
 * @param {Function} [opts.onProgress]    progress snapshots (queue job)
 */
const researchProductHashtags = async (product, { seedHashtags = [], excludeSeeds = [], onProgress } = {}) => {
    const fetchedAt = new Date().toISOString();
    const base = { source: "instagram_graph_api", seeds: [], hashtags: [], mediaAnalyzed: 0, fetchedAt, limitations: [] };

    if (!isHashtagApiConfigured()) {
        return { ...base, status: "unavailable", limitations: ["Live Instagram hashtag data not available: Meta hashtag API credentials are not configured."] };
    }
    // A brand name that already has a real Instagram id (e.g. a product simply called "Coffee") is kept — it costs no quota
    const exclude = [];
    for (const name of excludeSeeds) {
        if (!(await peekCachedHashtag(name))?.hashtagId) exclude.push(name);
    }
    const seeds = buildSeedHashtags(product, seedHashtags, MAX_SEEDS, exclude);
    if (!seeds.length) {
        return { ...base, status: "unavailable", limitations: ["No product keywords/category to search Instagram hashtags with."] };
    }

    const { groups, seedStats, limitations, mediaAnalyzed, failed, timings } = await collectHashtagData(seeds, { mode: "research", onProgress });

    let ranked = rankCoOccurringHashtags(groups, seeds);
    // Hashtags seen in only one post are noise — drop them when we have enough data
    const repeated = ranked.filter((h) => h.posts >= 2 || h.isSeed);
    if (repeated.length >= 25) ranked = repeated;
    ranked = ranked.slice(0, MAX_RESULTS);

    const status = !ranked.length ? "unavailable" : failed ? "partial" : "success";
    console.log(`[HashtagResearch] seeds=${seeds.join(",")} media=${mediaAnalyzed} hashtags=${ranked.length} status=${status}`);
    return { ...base, status, seeds: seedStats, hashtags: ranked, mediaAnalyzed, timings, limitations };
};

/**
 * For the Hashtags page: every hashtag found + the real posts behind them.
 * @param {Object}   args
 * @param {string[]|string} args.seeds   e.g. ["ghee", "desi ghee"] or "ghee, desi ghee"
 * @param {Object}  [args.product]       used for seeds when none are given
 */
const exploreHashtags = async ({ seeds: rawSeeds = [], product = null } = {}) => {
    if (!isHashtagApiConfigured()) {
        throw Object.assign(new Error("Meta hashtag API credentials are not configured (META_ACCESS_TOKEN, META_INSTAGRAM_USER_ID, META_GRAPH_API_VERSION)."), { statusCode: 500 });
    }
    const seeds = buildSeedHashtags(product || {}, rawSeeds);
    if (!seeds.length) {
        throw Object.assign(new Error("Type at least one hashtag or keyword (3+ letters)."), { statusCode: 400 });
    }

    // full mode: thumbnails (media_url) + all pages, because this page SHOWS the posts
    const { groups, seedStats, limitations, mediaAnalyzed, failed } = await collectHashtagData(seeds, { mode: "full" });
    if (!seedStats.some((s) => s.found)) {
        const err = new Error(seedStats.map((s) => `${s.hashtag}: ${s.error || s.note}`).join(" · "));
        err.statusCode = seedStats.some((s) => /limit/i.test(s.error || "")) ? 429 : 404;
        throw err;
    }

    // Posts: one entry per post, remembering which seed(s) and edge(s) it came from
    const posts = new Map();
    for (const { seed, edge, media } of groups) {
        for (const m of media) {
            const p = posts.get(m.id) || { ...toPostView(m), seeds: [], inTop: false, inRecent: false };
            if (!p.seeds.includes(`#${seed}`)) p.seeds.push(`#${seed}`);
            if (edge === "top_media") p.inTop = true;
            if (edge === "recent_media") p.inRecent = true;
            posts.set(m.id, p);
        }
    }
    const allPosts = [...posts.values()];
    // Only hashtags really used with the seeds: no one-off tags, no spam (#fyp), copies of a post counted once
    const ranked = rankHashtagsWithQuality(groups, seeds);
    const note = removedNote(ranked.removed);
    const byEngagement = (a, b) => (b.engagement ?? -1) - (a.engagement ?? -1);

    return {
        success: true,
        status: failed ? "partial" : "success",
        seeds: seedStats,
        hashtags: ranked.hashtags.slice(0, MAX_EXPLORE_RESULTS),
        removed: ranked.removed,
        topPosts: allPosts.filter((p) => p.inTop).sort(byEngagement),
        recentPosts: allPosts.filter((p) => p.inRecent).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        mediaAnalyzed,
        quota: await quotaInfo(),
        limitations: note ? [note, ...limitations] : limitations,
        source: "Instagram Graph API",
        fetchedAt: new Date().toISOString(),
    };
};

module.exports = { researchProductHashtags, exploreHashtags, buildSeedHashtags, quotaInfo, collectHashtagData, MIN_POSTS_PER_SEED };
