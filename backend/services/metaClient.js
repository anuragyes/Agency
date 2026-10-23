// ─────────────────────────────────────────────────────────────
// metaClient.js — ONE door for every hashtag call to graph.facebook.com
//
// Why one door?
//   1. Concurrency limit : max N Meta calls at the same time (parallel, but not a flood)
//   2. Spacing           : small gap between call starts (Meta dislikes bursts)
//   3. Backoff           : on a rate-limit answer -> wait 2s, 4s, 8s... and retry,
//                          and pause ALL calls for that time (one cooldown for everybody)
//   4. Timing logs       : every call prints how long it took -> we can see where time goes
//
// Env (all optional):
//   META_MAX_CONCURRENT=8      calls in flight at once
//   META_MIN_GAP_MS=150        min gap between two call starts
//   META_MAX_RETRIES=3         retries on rate-limit / network blips
//   META_TIMING_LOGS=true      print "[Meta] 812ms top_media #coffee p1"
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

// 8 = 4 seeds x (top + recent) all at once. Meta limits by number of calls per hour, not by parallel calls.
const MAX_CONCURRENT = Math.max(1, Number(process.env.META_MAX_CONCURRENT) || 8);
const MIN_GAP_MS = Math.max(0, Number(process.env.META_MIN_GAP_MS ?? 150));
const MAX_RETRIES = Math.max(0, Number(process.env.META_MAX_RETRIES ?? 3));
const BASE_BACKOFF_MS = Math.max(50, Number(process.env.META_BACKOFF_MS) || 2000);
const TIMING_LOGS = process.env.META_TIMING_LOGS !== "false";

// Meta error codes that mean "slow down" (app / user / page / BUC rate limits)
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002]);
// Temporary problems on Meta's side or the network -> worth one more try
const TRANSIENT_CODES = new Set([1, 2]);
// Connection blips -> retry the same request. NOT timeouts: a request that timed out is too heavy for Meta
// right now; repeating it wastes another 25s (seen in real logs) — the caller asks for less data instead.
const NETWORK_ERRORS = new Set(["ECONNRESET", "EAI_AGAIN", "ECONNREFUSED", "EPIPE"]);

let active = 0;
let lastStart = 0;
let pausedUntil = 0;
const waiting = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRateLimit = (err) =>
    err?.response?.status === 429 || RATE_LIMIT_CODES.has(err?.response?.data?.error?.code);

/** "Please reduce the amount of data" (code 1) is NOT retried here — the caller asks for less data instead */
const isReduceData = (err) =>
    err?.response?.data?.error?.code === 1 && /reduce the amount of data/i.test(err?.response?.data?.error?.message || "");

/** Our own timeout (axios) — Meta took too long for this much data */
const isTimeout = (err) =>
    !err?.response && (err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT" || /timeout/i.test(err?.message || ""));

/** Ask for a smaller page instead of repeating the same request */
const shouldAskForLess = (err) => isReduceData(err) || isTimeout(err) || err?.response?.data?.error?.code === 1;

const isRetryable = (err) => {
    if (shouldAskForLess(err)) return false;
    if (isRateLimit(err)) return true;
    if (NETWORK_ERRORS.has(err?.code)) return true;
    const status = err?.response?.status;
    if (status >= 500) return true;
    return TRANSIENT_CODES.has(err?.response?.data?.error?.code) && err?.response?.data?.error?.is_transient === true;
};

/** Wait for a free slot (concurrency + spacing + global cooldown) */
const acquire = async () => {
    if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
    active++;
    // global cooldown after a rate-limit answer
    for (let wait = pausedUntil - Date.now(); wait > 0; wait = pausedUntil - Date.now()) await sleep(wait);
    // spacing between starts
    const gap = lastStart + MIN_GAP_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
    if (gap > 0) await sleep(gap);
};

const release = () => {
    active--;
    const next = waiting.shift();
    if (next) next();
};

/**
 * GET a Graph API url through the shared limiter.
 * @param {string} url
 * @param {Object} params            query params (access_token included)
 * @param {Object} [opts]
 * @param {number} [opts.timeout]    ms
 * @param {string} [opts.label]      for the timing log, e.g. "top_media #coffee p1"
 */
const metaGet = async (url, params, { timeout = 25000, label = url.split("/").slice(-1)[0] } = {}) => {
    let attempt = 0;
    for (;;) {
        await acquire();
        const started = Date.now();
        let error;
        try {
            const res = await axios.get(url, { params, timeout });
            if (TIMING_LOGS) console.log(`[Meta] ${Date.now() - started}ms ${label}${attempt ? ` (retry ${attempt})` : ""}`);
            return res;
        } catch (err) {
            error = err;
        } finally {
            release(); // never sleep while holding a slot
        }

        if (TIMING_LOGS) console.warn(`[Meta] ${Date.now() - started}ms ${label} FAILED: ${error?.response?.data?.error?.message || error.message}`);
        if (attempt >= MAX_RETRIES || !isRetryable(error)) throw error;
        attempt++;
        // exponential backoff with a little jitter: 2s, 4s, 8s (+0–25%)
        const wait = Math.round(BASE_BACKOFF_MS * 2 ** (attempt - 1) * (1 + Math.random() * 0.25));
        if (isRateLimit(error)) {
            pausedUntil = Math.max(pausedUntil, Date.now() + wait); // everybody waits, not only this call
            console.warn(`[Meta] rate limited -> all calls paused ${wait}ms`);
        } else {
            await sleep(wait);
        }
    }
};

/** Run fn over items with at most `limit` running at once. Keeps result order. */
const mapLimit = async (items, limit, fn) => {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
};

/** For tests */
const _limiterState = () => ({ active, waiting: waiting.length, pausedUntil });

module.exports = { metaGet, mapLimit, isRateLimit, isReduceData, isTimeout, shouldAskForLess, _limiterState, MAX_CONCURRENT };
