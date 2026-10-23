// ─────────────────────────────────────────────────────────────
// queues/connection.js — Redis connection for BullMQ
//
// HOW THE QUEUE WORKS (big picture):
//
//   API (server.js)                    Redis                     Worker (workers/worker.js)
//   ───────────────                    ─────                     ──────────────────────────
//   POST /brief/research/jobs  ──add──▶  job waits in a list  ──▶  picks the job, does the slow work,
//   answers { jobId } in ~200ms           (+ progress, result)      job.updateProgress(...) after each seed,
//   GET  /brief/research/jobs/:id ◀──read──  state / progress  ◀──  returns the research = job result
//
// Redis is just the shared "order board" between the two processes.
// Local Redis (Docker Desktop):  docker run -d --name sociva-redis -p 6379:6379 redis
// .env:                          REDIS_URL=redis://127.0.0.1:6379
// ─────────────────────────────────────────────────────────────
// initalize with NULL if both will get connect get some value 
let bullmq = null;
let IORedis = null;
try {
    bullmq = require("bullmq");
    IORedis = require("ioredis");
} catch {
    // packages not installed yet (npm install) -> the API falls back to in-memory jobs
    error("Bullm is not install please run in terminal npm i ioredis bullmq")
}
// to lad the conntection string from .env file 
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6381";
const QUEUES_ENABLED = process.env.QUEUES_ENABLED !== "false";
// Redis key prefix for all queues (tests use their own prefix so a running worker never sees test jobs)
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || "sociva";

let lastErrorLog = 0;
const logRedisError = (who) => (err) => {
    // ioredis retries forever and emits an error every retry -> log at most once a minute
    if (Date.now() - lastErrorLog > 60000) {
        lastErrorLog = Date.now();
        console.warn(`[Redis] ${who}: ${err.message} (is Redis running? docker start sociva-redis)`);
    }
};

/**
 * New Redis connection.
 * @param {"queue"|"worker"} role
 *   queue  (API side): enableOfflineQueue=false -> if Redis is down, add() fails FAST instead of hanging the request
 *   worker           : waits / reconnects forever (a worker should survive a Redis restart)
 */
const createConnection = (role = "queue") => {
    //   if redis not loaded return null
    if (!IORedis) return null;
    //   start making connection with redis url 
    const conn = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,               // required by BullMQ
        enableOfflineQueue: role !== "queue",
        retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    conn.on("error", logRedisError(role));
    return conn;
};

const available = () => Boolean(bullmq && IORedis && QUEUES_ENABLED);

/** Resolves true when Redis answers PING within `ms` */
const ping = async (conn, ms = 1000) => {
    if (!conn) return false;
    try {
        const res = await Promise.race([
            conn.status === "ready" ? conn.ping() : new Promise((resolve, reject) => {
                conn.once("ready", () => conn.ping().then(resolve, reject));
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
        ]);
        return res === "PONG";
    } catch {
        return false;
    }
};

module.exports = { bullmq, createConnection, available, ping, REDIS_URL, QUEUE_PREFIX };
