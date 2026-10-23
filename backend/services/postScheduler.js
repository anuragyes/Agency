// ─────────────────────────────────────────────────────────────
// postScheduler.js — "Schedule for later" (Editor -> Approve -> pick date & time)
// Every 30 s: find Instagram + Facebook posts with status "scheduled" whose scheduledAt has come, and publish them.
//
// • Runs inside the API server (npm start / npm run dev) — no Redis / worker needed.
// • The server must be running at that time. If it was off, overdue posts go out as soon as it starts again.
// • Each post is claimed atomically (status scheduled -> publishing), so a restart, a second server
//   or the user clicking "publish now" at the same moment can never post it twice.
// • Errors don't crash anything: the post becomes "failed" with the reason (shown in the Editor + Calendar).
// Env: SCHEDULER_TICK_MS (default 30000) · DISABLE_POST_SCHEDULER=1 to turn it off.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const InstagramPost = require("../models/InstagramPost.js");
const FacebookPost = require("../models/FacebookPost.js");
const instagramPosts = require("../controllers/instagramPostController.js");
const facebookPosts = require("../controllers/facebookPostController.js");

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS) || 30 * 1000;
const BATCH = 10; // posts per platform per tick

const SOURCES = [
    { platform: "instagram", Model: InstagramPost, publish: instagramPosts.publishScheduled },
    { platform: "facebook", Model: FacebookPost, publish: facebookPosts.publishScheduled },
];

let timer = null;
let running = false;

/** One pass: publish everything that is due. Returns [{ platform, id, ok, error }] */
async function runSchedulerTick(now = new Date()) {
    if (running || mongoose.connection.readyState !== 1) return [];
    running = true;
    const done = [];
    try {
        for (const { platform, Model, publish } of SOURCES) {
            const due = await Model.find({ status: "scheduled", scheduledAt: { $lte: now } })
                .select("_id")
                .sort({ scheduledAt: 1 })
                .limit(BATCH)
                .lean();
            for (const { _id } of due) {
                // claim it — only one caller can flip scheduled -> publishing
                const doc = await Model.findOneAndUpdate(
                    { _id, status: "scheduled" },
                    { $set: { status: "publishing" } },
                    { returnDocument: "after" }
                );
                if (!doc) continue;
                console.log(`[scheduler] publishing ${platform} post ${_id} (scheduled for ${doc.scheduledAt?.toISOString()})`);
                const r = await publish(doc);
                if (r.ok) console.log(`[scheduler] ✓ ${platform} post ${_id} is live${r.permalink ? ` — ${r.permalink}` : ""}`);
                else console.warn(`[scheduler] ✗ ${platform} post ${_id} failed: ${r.error}`);
                done.push({ platform, id: String(_id), ok: r.ok, error: r.error });
            }
        }
    } catch (err) {
        console.error("[scheduler] tick failed:", err.message);
    } finally {
        running = false;
    }
    return done;
}

function startPostScheduler() {
    if (timer || process.env.DISABLE_POST_SCHEDULER === "1") return;
    timer = setInterval(runSchedulerTick, TICK_MS);
    setTimeout(runSchedulerTick, 5000); // catch up on anything that came due while the server was off
    console.log(`[scheduler] scheduled posts are checked every ${Math.round(TICK_MS / 1000)}s`);
}

function stopPostScheduler() {
    if (timer) clearInterval(timer);
    timer = null;
}

module.exports = { startPostScheduler, stopPostScheduler, runSchedulerTick };
