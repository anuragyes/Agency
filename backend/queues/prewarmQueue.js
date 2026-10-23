// ─────────────────────────────────────────────────────────────
// queues/prewarmQueue.js — repeatable "pre-warm hashtags" job
//
// A Job Scheduler is BullMQ's built-in cron: Redis remembers "run this every N hours"
// and the worker gets a new job each time. upsert = create or update (safe to call on every start).
// ─────────────────────────────────────────────────────────────
const { bullmq, createConnection, available, QUEUE_PREFIX } = require("./connection.js");

const PREWARM_QUEUE = "instagram-hashtag-prewarm";
const SCHEDULER_ID = "prewarm-hashtags";

let queue = null;
let connection = null;
const getPrewarmQueue = () => {
    if (!available()) return null;
    if (!queue) {
        connection = createConnection("worker");
        queue = new bullmq.Queue(PREWARM_QUEUE, {
            connection,
            prefix: QUEUE_PREFIX,
            defaultJobOptions: { removeOnComplete: 20, removeOnFail: 20 },
        });
        queue.on("error", () => { });
    }
    return queue;
};

/** Register (or update / remove) the schedule. Called by the worker on start. */
const schedulePrewarm = async () => {
    const q = getPrewarmQueue();
    if (!q) return null;
    if (process.env.PREWARM_ENABLED === "false") {
        await q.removeJobScheduler(SCHEDULER_ID).catch(() => { });
        console.log("[Prewarm] disabled (PREWARM_ENABLED=false)");
        return null;
    }
    const hours = Math.max(1, Number(process.env.PREWARM_EVERY_HOURS) || 6);
    await q.upsertJobScheduler(SCHEDULER_ID, { every: hours * 60 * 60 * 1000 }, { name: "prewarm", data: {} });
    console.log(`[Prewarm] scheduled every ${hours}h`);
    return hours;
};

/** Run it once now (POST /api/hashtags/prewarm or a test) */
const runPrewarmNow = async () => {
    const q = getPrewarmQueue();
    if (!q) return null;
    const job = await q.add("prewarm-now", {});
    return job.id;
};

const closePrewarmQueue = async () => {
    if (queue) await queue.close().catch(() => { });
    if (connection) connection.disconnect();
    queue = null;
    connection = null;
};

module.exports = { PREWARM_QUEUE, getPrewarmQueue, schedulePrewarm, runPrewarmNow, closePrewarmQueue };
