// End-to-end queue test: API side -> Redis -> worker -> result. Needs a running Redis:
//   docker run -d --name sociva-redis -p 6379:6379 redis
//   npm run test:queue
// Uses a FAKE Meta API and its own Redis prefix, so a real worker never sees these jobs.
process.env.QUEUE_PREFIX = `sociva-test-${process.pid}`;
process.env.META_ACCESS_TOKEN = "EAA_test";
process.env.META_INSTAGRAM_USER_ID = "17840000000000000";
process.env.META_GRAPH_API_VERSION = "v23.0";
process.env.META_MIN_GAP_MS = "0";
process.env.META_TIMING_LOGS = "false";
process.env.PREWARM_ENABLED = "false";
process.env.PREWARM_CATEGORY_HASHTAGS = "coffee,skincare";
process.env.PREWARM_QUOTA_RESERVE = "0";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mediaCalls = 0;
axios.get = async (url, { params }) => {
    await sleep(30);
    if (url.endsWith("/ig_hashtag_search")) return { data: { data: [{ id: `id_${params.q}` }] } };
    if (url.endsWith("/recently_searched_hashtags")) return { data: { data: [] } };
    mediaCalls++;
    const [, tag, edge] = url.match(/\/id_(\w+)\/(top_media|recent_media)$/);
    const page = params.after ? Number(params.after) : 1;
    return {
        data: {
            data: Array.from({ length: 50 }, (_, i) => ({ id: `${tag}${edge}${page}_${i}`, caption: `#${tag} #brew${i % 6} #morning`, like_count: i, comments_count: 1 })),
            paging: page < 4 ? { cursors: { after: String(page + 1) }, next: "x" } : {},
        },
    };
};

const { createConnection, ping } = require("../../queues/connection.js");
const { startBriefResearchJob, getBriefResearchJob } = require("../../services/researchJobService.js");
const { runPrewarmNow, getPrewarmQueue, closePrewarmQueue } = require("../../queues/prewarmQueue.js");
const { getQueue, closeQueue } = require("../../queues/researchQueue.js");
const { startWorkers } = require("../../workers/worker.js");

const waitFor = async (jobId, ms = 10000) => {
    const end = Date.now() + ms;
    const seen = [];
    for (;;) {
        const job = await getBriefResearchJob(jobId);
        if (job?.progress) seen.push(job.progress);
        if (job && ["completed", "failed"].includes(job.state)) return { job, seen };
        if (Date.now() > end) throw new Error(`job ${jobId} still ${job?.state}`);
        await sleep(50);
    }
};

const brief = (words) => ({ platform: "instagram", importantWords: words, product: { name: "Ycoo" } });

describe("BullMQ research queue (needs Redis)", async () => {
    const probe = createConnection("queue");
    const redisUp = await ping(probe, 1500);
    probe.disconnect();
    let workers;

    before(async () => {
        if (redisUp) workers = await startWorkers({ connectMongo: false });
    });
    after(async () => {
        await workers?.close();
        for (const q of [getQueue(), getPrewarmQueue()]) {
            if (q) await q.obliterate({ force: true }).catch(() => {});
        }
        await closeQueue();
        await closePrewarmQueue();
    });

    it("API gets a jobId at once, the worker reports per-seed progress and the result", { skip: !redisUp && "Redis not running" }, async () => {
        const t0 = Date.now();
        const started = await startBriefResearchJob({ brief: brief(["coffee", "arabica", "Ycoo"]), productProfile: { name: "Ycoo" } });
        assert.ok(Date.now() - t0 < 1500, "start must be fast");
        assert.equal(started.mode, "queue");

        const { job, seen } = await waitFor(started.jobId);
        assert.equal(job.state, "completed");
        assert.ok(job.result.hashtags.length > 0);
        assert.deepEqual(job.result.seeds.map((s) => s.hashtag), ["#coffee", "#arabica"], "brand name Ycoo is not searched");
        assert.ok(seen.some((p) => p.seeds?.some((s) => s.status === "done")), "progress showed a finished seed");
        assert.ok(seen.some((p) => p.partialHashtags?.length), "progress showed hashtags found so far");
    });

    it("same brief again -> same job reused (instant, 0 Meta calls)", { skip: !redisUp && "Redis not running" }, async () => {
        mediaCalls = 0;
        const again = await startBriefResearchJob({ brief: brief(["coffee", "arabica", "Ycoo"]), productProfile: { name: "Ycoo" } });
        assert.equal(again.reused, true);
        const job = await getBriefResearchJob(again.jobId);
        assert.equal(job.state, "completed");
        assert.equal(mediaCalls, 0);
    });

    it("pre-warm job refreshes used hashtags + categories", { skip: !redisUp && "Redis not running" }, async () => {
        mediaCalls = 0;
        const id = await runPrewarmNow();
        const q = getPrewarmQueue();
        let job;
        for (let i = 0; i < 200; i++) {
            job = await q.getJob(id);
            if (["completed", "failed"].includes(await job.getState())) break;
            await sleep(50);
        }
        assert.equal(await job.getState(), "completed", job.failedReason);
        const summary = job.returnvalue;
        assert.ok(summary.usedRefreshed.includes("coffee"));
        assert.ok(summary.categoriesWarmed.includes("skincare"));
        assert.ok(mediaCalls > 0, "pre-warm fetched fresh data");
    });

    it("no worker running -> falls back to an in-memory job (same API)", { skip: !redisUp && "Redis not running" }, async () => {
        await workers.close();
        workers = null;
        await sleep(5200); // queueReady() caches its answer for 5s
        const started = await startBriefResearchJob({ brief: brief(["coldbrew"]), productProfile: {} });
        assert.equal(started.mode, "memory");
        const { job } = await waitFor(started.jobId);
        assert.equal(job.state, "completed");
        assert.ok(job.result.hashtags.length > 0);
    });
});
