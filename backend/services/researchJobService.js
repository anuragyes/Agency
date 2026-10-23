// ─────────────────────────────────────────────────────────────
// researchJobService.js — one API for research jobs, two ways to run them
//
//   queue  (preferred) : Redis + BullMQ, the worker process does the work (npm run worker)
//   memory (fallback)  : Redis down / no worker running / packages not installed ->
//                        the API process runs the job itself, same progress + result shape.
// The frontend never sees the difference (except `mode`), so nothing breaks while Redis is off.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const researchQueue = require("../queues/researchQueue.js");
const researchInstagramFromBrief = require("../ai/marketResearch/platforms/instagram/InstagramBriefResearch.js");

const MEMORY_JOB_TTL_MS = 60 * 60 * 1000;
const memoryJobs = new Map();

/** Only what research needs (the full product profile is big) */
const slimProfile = (p = {}) => {
    const a = p.aiProfile || p;
    return { name: a.name, brand: a.brand, brandName: a.brandName, keywords: Array.isArray(a.keywords) ? a.keywords : [] };
};

const cleanupMemoryJobs = () => {
    for (const [id, job] of memoryJobs) {
        if (job.finishedAt && Date.now() - job.finishedAt > MEMORY_JOB_TTL_MS) memoryJobs.delete(id);
    }
};

const startMemoryJob = ({ brief, productProfile }, reason) => {
    cleanupMemoryJobs();
    const job = {
        jobId: `mem_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        mode: "memory",
        state: "active",
        progress: { stage: "starting", seeds: [], partialHashtags: [], elapsedMs: 0 },
        result: null,
        failedReason: null,
        attemptsMade: 0,
        createdAt: Date.now(),
        startedAt: Date.now(),
        finishedAt: null,
        reason,
    };
    memoryJobs.set(job.jobId, job);
    researchInstagramFromBrief({ brief, productProfile, onProgress: (p) => { job.progress = p; } })
        .then((research) => Object.assign(job, { state: "completed", result: research, finishedAt: Date.now() }))
        .catch((err) => Object.assign(job, { state: "failed", failedReason: err.message, finishedAt: Date.now() }));
    return job;
};

/**
 * Start (or reuse) a research job.
 * @returns {Promise<{ jobId, mode: "queue"|"memory", reused, reason? }>}
 */
const startBriefResearchJob = async ({ brief, productProfile }) => {
    const input = { brief, productProfile: slimProfile(productProfile) };
    let reason = "Redis / BullMQ not available";
    if (await researchQueue.queueReady()) {
        try {
            const { jobId, reused } = await researchQueue.addBriefResearchJob(input);
            return { jobId, mode: "queue", reused };
        } catch (err) {
            reason = `queue error: ${err.message}`;
        }
    } else if (researchQueue.getQueue()) {
        reason = "Redis is down or no worker is running (npm run worker)";
    }
    console.warn(`[ResearchJobs] running in memory: ${reason}`);
    const job = startMemoryJob(input, reason);
    return { jobId: job.jobId, mode: "memory", reused: false, reason };
};

/** Current state of a job (null = unknown id / expired) */
const getBriefResearchJob = async (jobId) => {
    if (typeof jobId !== "string" || !/^[\w-]{4,64}$/.test(jobId)) return null;
    if (jobId.startsWith("mem_")) {
        const job = memoryJobs.get(jobId);
        return job ? { ...job } : null;
    }
    try {
        return await researchQueue.getBriefResearchJob(jobId);
    } catch (err) {
        throw Object.assign(new Error(`Can't read the job from Redis: ${err.message}`), { statusCode: 503 });
    }
};

module.exports = { startBriefResearchJob, getBriefResearchJob, slimProfile };
