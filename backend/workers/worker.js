// ─────────────────────────────────────────────────────────────
// workers/worker.js — the KITCHEN: picks jobs from Redis and does the slow work
//
//   npm run worker        (second terminal, next to npm run dev)
//   npm run dev:worker    same, restarts on file save
//
// Two workers in this process:
//   1. instagram-brief-research   Studio step 5: live hashtag research for a brief
//                                 -> job.updateProgress() after every seed, returns the research
//   2. instagram-hashtag-prewarm  every PREWARM_EVERY_HOURS: refresh used + category hashtags
//
// Env (optional):
//   RESEARCH_WORKER_CONCURRENCY=2   research jobs at the same time (each job already fetches seeds in parallel)
// ─────────────────────────────────────────────────────────────
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { bullmq, createConnection, available, REDIS_URL, QUEUE_PREFIX } = require("../queues/connection.js");
const { RESEARCH_QUEUE } = require("../queues/researchQueue.js");
const { PREWARM_QUEUE, schedulePrewarm, closePrewarmQueue } = require("../queues/prewarmQueue.js");
const researchInstagramFromBrief = require("../ai/marketResearch/platforms/instagram/InstagramBriefResearch.js");
const { prewarmHashtags } = require("../services/hashtagPrewarmService.js");

const startWorkers = async ({ connectMongo = true } = {}) => {
    if (!available()) {
        throw new Error("bullmq / ioredis are not installed (npm install) or QUEUES_ENABLED=false");
    }
    if (connectMongo && mongoose.connection.readyState === 0) {
        // the hashtag id + posts caches live in Mongo
        await mongoose.connect(process.env.MONGO_URI);
        console.log("[Worker] MongoDB connected");
    }

    const connections = [];
    const conn = () => {
        const c = createConnection("worker");
        connections.push(c);
        return c;
    };

    // ── 1. research jobs ──
    const researchWorker = new bullmq.Worker(
        RESEARCH_QUEUE,
        async (job) => {
            const t0 = Date.now();
            console.log(`[Worker] research job ${job.id} started (attempt ${job.attemptsMade + 1})`);
            await job.updateProgress({ stage: "starting", seeds: [], partialHashtags: [], elapsedMs: 0 });
            const research = await researchInstagramFromBrief({
                brief: job.data.brief,
                productProfile: job.data.productProfile || {},
                onProgress: (p) => job.updateProgress(p),
            });
            await job.updateProgress({ stage: "done", seeds: research.seeds, partialHashtags: research.hashtags.slice(0, 10).map((h) => h.hashtag), mediaAnalyzed: research.mediaAnalyzed, elapsedMs: Date.now() - t0 });
            console.log(`[Worker] research job ${job.id} done in ${Date.now() - t0}ms: ${research.hashtags.length} hashtags from ${research.mediaAnalyzed} posts`);
            return research; // -> job.returnvalue (what GET /brief/research/jobs/:id sends as result)
        },
        {
            connection: conn(),
            prefix: QUEUE_PREFIX,
            concurrency: Math.max(1, Number(process.env.RESEARCH_WORKER_CONCURRENCY) || 2),
        }
    );

    // ── 2. pre-warm jobs (one at a time) ──
    const prewarmWorker = new bullmq.Worker(
        PREWARM_QUEUE,
        async (job) => prewarmHashtags({ onProgress: (p) => job.updateProgress(p) }),
        { connection: conn(), prefix: QUEUE_PREFIX, concurrency: 1 }
    );

    // ── 3. inbox AI jobs (handles incoming social media webhook messages) ──
    const { INBOX_QUEUE_NAME, processInboxJob } = require("../queues/inboxQueue.js");
    const inboxWorker = new bullmq.Worker(
        INBOX_QUEUE_NAME,
        async (job) => {
            console.log(`[Worker] Inbox job ${job.id} started for sender: ${job.data?.senderName}`);
            return processInboxJob(job.data);
        },
        { connection: conn(), prefix: QUEUE_PREFIX, concurrency: 4 }
    );

    for (const [name, w] of [["research", researchWorker], ["prewarm", prewarmWorker], ["inbox", inboxWorker]]) {
        w.on("failed", (job, err) => console.error(`[Worker] ${name} job ${job?.id} failed:`, err.message));
        w.on("error", () => {}); // Redis connection errors are logged once a minute by connection.js
    }

    await schedulePrewarm().catch((err) => console.warn("[Prewarm] schedule failed:", err.message));
    console.log(`[Worker] listening on ${REDIS_URL} -> ${RESEARCH_QUEUE}, ${PREWARM_QUEUE}, ${INBOX_QUEUE_NAME}`);

    // close() waits for running jobs to finish, then frees the Redis connections
    const close = async () => {
        await Promise.allSettled([researchWorker.close(), prewarmWorker.close(), inboxWorker.close()]);
        connections.forEach((c) => c.disconnect());
    };
    return { researchWorker, prewarmWorker, inboxWorker, close };
};

// `node workers/worker.js` -> start; `require()` (tests / START_WORKER_WITH_API) -> just export
if (require.main === module) {
    startWorkers()
        .then(({ close }) => {
            const stop = async (sig) => {
                console.log(`[Worker] ${sig}: finishing current jobs...`);
                await close();
                await closePrewarmQueue();
                await mongoose.disconnect().catch(() => {});
                process.exit(0);
            };
            process.on("SIGINT", () => stop("SIGINT"));
            process.on("SIGTERM", () => stop("SIGTERM"));
        })
        .catch((err) => {
            console.error("[Worker] could not start:", err.message);
            process.exit(1);
        });
}

module.exports = { startWorkers };
