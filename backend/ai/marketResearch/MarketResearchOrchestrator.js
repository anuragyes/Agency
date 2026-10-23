// ─────────────────────────────────────────────────────────────
// MarketResearchOrchestrator.js — "Market Research" box in the diagram.
// The orchestrator COORDINATES the platform agents; it does not do research itself.
//
//   Product Profile ─► Market Research ─┬► means not in soical meida   only internet we have another Ai agent for that to do research on that ─┐
//                                       ├►    ─┤
//                                       ├►   ─┼► Research Aggregator
//                                       ├►   ─┤
//                                       └► ─┘
//
// FIX: line 1 of the old file had the `require(...)` INSIDE the comment, and pointed to
//      "InstagramResearchAgent.js" which does not exist -> InstagramResearchAgent was undefined.
// ─────────────────────────────────────────────────────────────
const { PLATFORMS } = require("../schemas/ResearchSchema.js");
const aggregateResearch = require("./ResearchAggregator.js");

// STEP 1: Registry — platform key -> agent. Adding a platform later = 1 new file + 1 line here.
const AGENTS = {
    instagram: require("./platforms/instagram/InstagramResearchAgent"),
    youtube: require("./platforms/youtube/YouTubeResearchAgent"),
    facebook: require("./platforms/facebook/FacebookResearchAgent"),
    whatsapp: require("./platforms/whatsapp/WhatsAppResearchAgent"),
    pinterest: require("./platforms/pinterest/PinterestResearchAgent"),
};

// STEP 2: Settings from .env
// CONCURRENCY = how many agents call the LLM at the same time.
//   5 at once -> high chance of "429 rate limit" on free tier. 2 is a safe default.
const CONCURRENCY = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || 2);
const AGENT_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS) || 180_000;   // includes adapter retries

// Promise with a time limit, so one hanging agent cannot block the whole run forever
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Run async tasks with at most `limit` running at once (a tiny worker pool)
async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;                       // take the next item (safe: JS is single-threaded)
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return results;
}

// Validate requested platforms; default = all 5
function resolvePlatforms(platforms) {
    if (!platforms || (Array.isArray(platforms) && !platforms.length)) return [...PLATFORMS];
    const list = (Array.isArray(platforms) ? platforms : String(platforms).split(","))
        .map((p) => String(p).trim().toLowerCase())
        .filter(Boolean);
    const unknown = list.filter((p) => !AGENTS[p]);
    if (unknown.length) {
        const err = new Error(`Unknown platform(s): ${unknown.join(", ")}. Supported: ${PLATFORMS.join(", ")}`);
        err.statusCode = 400;
        throw err;
    }
    return [...new Set(list)];
}

/**
 * Run market research for one product.
 * @param {Object}   args
 * @param {Object}   args.product        Product document from Phase 1 (with aiProfile)
 * @param {Object}  [args.researchData]  Real data per platform, e.g. { instagram: [...posts], youtube: [...] }
 * @param {string[]}[args.platforms]     Subset of platforms; default all 5
 * @param {Function}[args.onProgress]    Called after each platform finishes (used to update DB / UI)
 * @param {Object}  [args.llm]           Optional LLM override (tests use a fake one)
 */
const runMarketResearch = async ({ product, researchData = {}, platforms, onProgress, llm } = {}) => {
    // STEP 3: Guard — no product profile, nothing to research
    if (!product) throw Object.assign(new Error("runMarketResearch: product is required"), { statusCode: 400 });

    const selected = resolvePlatforms(platforms);
    const startedAt = new Date();
    const platformResults = {};

    // STEP 4: Fan-out — run the platform agents (max CONCURRENCY at a time)
    await runWithConcurrency(selected, CONCURRENCY, async (platform) => {
        const agent = AGENTS[platform];
        let result;
        try {
            result = await withTimeout(
                agent({ product, researchData: researchData?.[platform] || [], llm }),
                AGENT_TIMEOUT_MS,
                `${platform} research`
            );
        } catch (err) {
            // Agents never throw themselves; this only catches the timeout
            result = { platform, limitations: [err.message], meta: { status: "failed", error: err.message } };
        }
        platformResults[platform] = result;

        // STEP 5: Progress callback — lets the service save partial results while others still run
        if (onProgress) {
            try { await onProgress({ platform, result, done: Object.keys(platformResults).length, total: selected.length }); }
            catch (e) { console.warn("[MarketResearch] onProgress failed:", e.message); }
        }
    });

    // STEP 6: Fan-in — merge everything in the Research Aggregator
    const aggregate = aggregateResearch({ product, platformResults, requestedPlatforms: selected });

    // STEP 7: Overall status: completed (all ok) / partial (some failed) / failed (all failed)
    const okCount = aggregate.coverage.succeeded.length;
    const status = okCount === selected.length ? "completed" : okCount > 0 ? "partial" : "failed";

    return {
        productId: product._id ? String(product._id) : "",
        status,
        platforms: platformResults,
        aggregate,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
    };
};

module.exports = runMarketResearch;
module.exports.AGENTS = AGENTS;
module.exports._internals = { runWithConcurrency, withTimeout, resolvePlatforms };
