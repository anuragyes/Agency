// ─────────────────────────────────────────────────────────────
// progressTracker.js — live agent progress for one pipeline run
//   in memory (instant, read by GET /:id/progress) + throttled writes to MongoDB (survives restarts)
// ─────────────────────────────────────────────────────────────
const CompetitorResearch = require("../../models/CompetitorResearch.js");

const LIVE = new Map(); // reportId -> pipeline state
const KEEP_MS = 15 * 60 * 1000;
const MAX_LOG = 80;

class ProgressTracker {
    constructor(reportId, state, { saveEveryMs = 700 } = {}) {
        this.id = String(reportId);
        this.state = state;
        this.saveEveryMs = saveEveryMs;
        this.timer = null;
        this.saving = Promise.resolve();
        LIVE.set(this.id, state);
    }

    agent(id) { return this.state.agents.find((a) => a.id === id); }

    log(agentId, message) {
        this.state.log.push({ at: new Date().toISOString(), agent: agentId, message: String(message).slice(0, 300) });
        if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
    }

    update(id, patch = {}, message) {
        const a = this.agent(id);
        if (!a) return;
        const { metrics, ...rest } = patch;
        Object.assign(a, rest);
        if (metrics) a.metrics = { ...a.metrics, ...metrics };
        if (message) { a.message = message; this.log(id, message); }
        this.schedule();
    }

    start(id, message) {
        this.state.current = id;
        this.update(id, { status: "running", startedAt: new Date().toISOString(), progress: 2 }, message);
    }

    progress(id, progress, message, metrics) { this.update(id, { progress: Math.max(0, Math.min(99, Math.round(progress))), ...(metrics && { metrics }) }, message); }

    finish(id, status, message, metrics) {
        const a = this.agent(id);
        if (!a) return;
        const now = new Date();
        this.update(id, {
            status, progress: status === "done" ? 100 : a.progress, finishedAt: now.toISOString(),
            durationMs: a.startedAt ? now - new Date(a.startedAt) : 0, ...(metrics && { metrics }),
        }, message);
    }

    done(id, message, metrics) { this.finish(id, "done", message, metrics); }
    fail(id, err) { this.finish(id, "failed", `Failed: ${err?.message || err}`); }
    skip(id, message) { this.update(id, { status: "skipped", progress: 0 }, message); }
    wait(id, message) { this.update(id, { status: "waiting", progress: 0 }, message); }

    child(id, key, patch) {
        const a = this.agent(id);
        if (!a) return;
        const c = a.children.find((x) => x.key === key);
        if (c) Object.assign(c, patch); else a.children.push({ key, status: "queued", ...patch });
        this.schedule();
    }

    count(key, by = 1) { this.state.counters[key] = (this.state.counters[key] || 0) + by; this.schedule(); }

    /** throttled save of the pipeline field */
    schedule() {
        if (this.timer) return;
        this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.saveEveryMs);
    }

    flush(extra = {}) {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        const snapshot = JSON.parse(JSON.stringify(this.state));
        this.saving = this.saving.then(() => CompetitorResearch.updateOne({ _id: this.id }, { $set: { pipeline: snapshot, ...extra } }))
            .catch((err) => console.error("[CompetitorIntel] progress save failed:", err.message));
        return this.saving;
    }

    end(status) {
        this.state.status = status;
        this.state.current = null;
        this.state.finishedAt = new Date().toISOString();
        setTimeout(() => LIVE.delete(this.id), KEEP_MS).unref?.();
    }
}

const liveProgress = (id) => LIVE.get(String(id)) || null;

module.exports = { ProgressTracker, liveProgress };
