// ─────────────────────────────────────────────────────────────
// queues/researchQueue.js — the "Instagram brief research" queue (API side)
//
//   addBriefResearchJob({ brief, productProfile })  -> { jobId, reused }
//   getBriefResearchJob(jobId)                      -> { state, progress, result, ... } | null
//   queueReady()                                    -> true when Redis answers AND a worker is running
//
// The worker that RUNS these jobs lives in workers/worker.js (separate process: npm run worker).
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { bullmq, createConnection, available, ping, QUEUE_PREFIX } = require("./connection.js");

const RESEARCH_QUEUE = "instagram-brief-research";
// Same brief again within this time -> reuse the finished job (instant result, 0 Meta calls)
const REUSE_FINISHED_MS = (Number(process.env.RESEARCH_JOB_REUSE_MINUTES) || 10) * 60 * 1000;

let queue = null;
let connection = null;
let readyCache = { at: 0, value: false };

const getQueue = () => {
    if (!available()) return null;
    if (!queue) {
        connection = createConnection("queue");
        queue = new bullmq.Queue(RESEARCH_QUEUE, {
            connection,
            prefix: QUEUE_PREFIX,
            defaultJobOptions: {
                attempts: 2,                                     // 1 retry if the job crashes (Meta problems don't crash it)
                backoff: { type: "exponential", delay: 5000 },   // retry after 5s
                removeOnComplete: { age: 24 * 60 * 60 },         // Redis forgets finished jobs after 24h
                removeOnFail: { age: 24 * 60 * 60 },
            },
        });
        queue.on("error", () => {}); // connection errors are already logged once a minute
    }
    return queue;
};

/** Redis up + at least one worker listening (cached 5s so polling doesn't ping every time) */
const queueReady = async () => {
    if (Date.now() - readyCache.at < 5000) return readyCache.value;
    const q = getQueue();
    let value = false;
    if (q && (await ping(connection))) {
        try {
            value = (await q.getWorkersCount()) > 0;
            if (!value) console.warn("[ResearchQueue] Redis is up but no worker is running -> start it: npm run worker");
        } catch {
            value = false;
        }
    }
    readyCache = { at: Date.now(), value };
    return value;
};

/** Same research input -> same job id (double clicks / repeat runs reuse one job) */
const jobIdFor = ({ brief, productProfile }) => {
    const input = JSON.stringify({
        words: [brief?.importantWords, brief?.hashtagSeeds, brief?.keywords],
        product: brief?.product?.name || "",
        keywords: productProfile?.keywords || [],
    });
    return "igr_" + crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
};

/**
 * Put a research job in the queue.
 * @returns {Promise<{ jobId: string, reused: boolean }>}
 */
const addBriefResearchJob = async ({ brief, productProfile }) => {
    const q = getQueue();
    const jobId = jobIdFor({ brief, productProfile });

    const existing = await q.getJob(jobId);
    if (existing) {
        const state = await existing.getState();
        const fresh = state === "completed" && Date.now() - (existing.finishedOn || 0) < REUSE_FINISHED_MS;
        if (["waiting", "active", "delayed", "prioritized", "waiting-children"].includes(state) || fresh) {
            return { jobId, reused: true };
        }
        await existing.remove().catch(() => {}); // old result or failed -> run again
    }

    await q.add("research", { brief, productProfile }, { jobId });
    return { jobId, reused: false };
};

/** What the frontend polls */
const getBriefResearchJob = async (jobId) => {
    const q = getQueue();
    if (!q) return null;
    const job = await q.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    let workers = null;
    if (state === "waiting") workers = await q.getWorkersCount().catch(() => null);
    return {
        jobId: job.id,
        mode: "queue",
        state,                                   // waiting | active | completed | failed | delayed
        progress: job.progress || null,          // set by the worker: { stage, seeds[], partialHashtags[], ... }
        result: state === "completed" ? job.returnvalue : null,
        failedReason: state === "failed" ? job.failedReason : null,
        attemptsMade: job.attemptsMade,
        createdAt: job.timestamp,
        startedAt: job.processedOn || null,
        finishedAt: job.finishedOn || null,
        ...(workers === 0 && { hint: "No worker is running — start it with: npm run worker" }),
    };
};

/** Close the queue + its Redis connection (tests / shutdown) */
const closeQueue = async () => {
    if (queue) await queue.close().catch(() => {});
    if (connection) connection.disconnect();
    queue = null;
    connection = null;
    readyCache = { at: 0, value: false };
};

module.exports = { RESEARCH_QUEUE, getQueue, queueReady, addBriefResearchJob, getBriefResearchJob, jobIdFor, closeQueue };
