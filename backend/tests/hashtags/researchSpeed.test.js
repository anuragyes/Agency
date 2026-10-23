// Speed + data tests for hashtag research with a FAKE Meta API (no network, no Mongo).
//   node --test tests/hashtags/researchSpeed.test.js
process.env.META_ACCESS_TOKEN = "EAA_test";
process.env.META_INSTAGRAM_USER_ID = "17840000000000000";
process.env.META_GRAPH_API_VERSION = "v23.0";
process.env.META_MIN_GAP_MS = "0";
process.env.META_BACKOFF_MS = "50";
process.env.META_TIMING_LOGS = "false";
process.env.INSTAGRAM_HASHTAG_TIMEOUT_MS = "300";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

// ── fake Meta ────────────────────────────────────────────────
const LATENCY = 40;
let calls, inFlight, maxInFlight, behaviour;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const postsFor = (tag, edge, page, size) =>
    Array.from({ length: size }, (_, i) => ({
        id: `${tag}_${edge}_${page}_${i}`,
        caption: `nice #${tag} #shared${i % 5} #only${tag}${i % 3}`,
        like_count: 10 + i,
        comments_count: i % 4,
        media_type: "IMAGE",
        permalink: "https://instagram.com/p/x",
        timestamp: new Date().toISOString(),
    }));

const fakeMeta = async (url, { params }) => {
    calls.push({ url, params });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
        await sleep(LATENCY);
        if (behaviour.rateLimitOnce && !behaviour.rateLimited) {
            behaviour.rateLimited = true;
            throw Object.assign(new Error("429"), { response: { status: 429, data: { error: { code: 4, message: "Application request limit reached" } } } });
        }
        if (url.endsWith("/ig_hashtag_search")) {
            return { data: { data: params.q === "ycoo" ? [] : [{ id: `id_${params.q}` }] } };
        }
        const [, id, edge] = url.match(/\/(id_\w+)\/(top_media|recent_media)$/);
        const tag = id.slice(3);
        if (behaviour.slowAt25 && params.limit === 25) {
            await sleep(400); // longer than the test timeout below
        }
        if (behaviour.page2Fails && params.after === "2" && params.limit === 25) {
            throw Object.assign(new Error("reduce"), { response: { status: 500, data: { error: { code: 1, message: "Please reduce the amount of data you're asking for, then retry your request" } } } });
        }
        if (params.fields.includes("media_url") && tag === "popular") {
            throw Object.assign(new Error("reduce"), { response: { status: 500, data: { error: { code: 1, message: "Please reduce the amount of data you're asking for, then retry your request" } } } });
        }
        const page = params.after ? Number(params.after) : 1;
        const size = tag.startsWith("niche") ? 20 : Math.min(50, params.limit);
        const lastPage = 6;
        return {
            data: {
                data: postsFor(tag, edge, page, size),
                paging: page < lastPage ? { cursors: { after: String(page + 1) }, next: "https://next" } : { cursors: {} },
            },
        };
    } finally {
        inFlight--;
    }
};
// like axios: give up after `timeout` ms
axios.get = (url, cfg) => Promise.race([
    fakeMeta(url, cfg),
    sleep(cfg.timeout || 1e9).then(() => { throw Object.assign(new Error(`timeout of ${cfg.timeout}ms exceeded`), { code: "ECONNABORTED" }); }),
]);

// fresh modules per test (in-memory caches start empty)
const load = () => {
    for (const k of Object.keys(require.cache)) {
        if (/services[\\/](instagramService|instagramHashtagResearchService|metaClient)\.js$/.test(k)) delete require.cache[k];
    }
    return require("../../services/instagramHashtagResearchService.js");
};

beforeEach(() => {
    calls = [];
    inFlight = 0;
    maxInFlight = 0;
    behaviour = {};
});

const mediaCalls = () => calls.filter((c) => /_media$/.test(c.url));

describe("hashtag research speed-up", () => {
    it("research mode never asks Meta for media_url", async () => {
        const { researchProductHashtags } = load();
        await researchProductHashtags({}, { seedHashtags: ["coffee", "arabica"] });
        assert.ok(mediaCalls().length > 0);
        assert.ok(mediaCalls().every((c) => !c.params.fields.includes("media_url")));
    });

    it("runs seeds in parallel and keeps 150+ posts per seed", async () => {
        const { researchProductHashtags } = load();
        const started = Date.now();
        const r = await researchProductHashtags({}, { seedHashtags: ["coffee", "arabica", "filtercoffee", "coldbrew"] });
        const ms = Date.now() - started;
        assert.equal(r.status, "success");
        assert.ok(maxInFlight >= 3, `expected parallel calls, max in flight was ${maxInFlight}`);
        for (const s of r.seeds) assert.ok(s.topPosts + s.recentPosts24h >= 150, `${s.hashtag} has ${s.topPosts + s.recentPosts24h}`);
        // 4 ids one by one (4 x 40ms) + media calls in parallel (top needs 2 pages) ≈ 300ms. Old sequential 3-page version ≈ 4 x (40 + 120) = 640ms.
        assert.ok(ms < 500, `took ${ms}ms`);
        assert.ok(r.mediaAnalyzed >= 600);
    });

    it("floor protection: a niche hashtag (20 posts/page) keeps paging until 150 posts", async () => {
        const { researchProductHashtags } = load();
        const r = await researchProductHashtags({}, { seedHashtags: ["nichetea"] });
        const s = r.seeds[0];
        assert.ok(s.topPosts + s.recentPosts24h >= 150, `got ${s.topPosts + s.recentPosts24h}`);
        assert.ok(mediaCalls().length <= 12, "page cap per edge");
    });

    it("timeout -> asks for a smaller page, never repeats the same heavy request", async () => {
        behaviour.slowAt25 = true; // limit=25 hangs past the timeout, limit=10 answers
        const { researchProductHashtags } = load();
        const r = await researchProductHashtags({}, { seedHashtags: ["coffee"] });
        const at25 = mediaCalls().filter((c) => c.params.limit === 25 && !c.params.after);
        assert.equal(at25.length, 2, "one try per edge at 25, no retries of the same request");
        assert.ok(mediaCalls().some((c) => c.params.limit === 10));
        assert.ok(r.seeds[0].topPosts > 0 && r.seeds[0].recentPosts24h > 0);
    });

    it("a heavy page 2 -> same cursor with a smaller page instead of stopping", async () => {
        behaviour.page2Fails = true;
        const { researchProductHashtags } = load();
        const r = await researchProductHashtags({}, { seedHashtags: ["coffee"] });
        assert.ok(mediaCalls().some((c) => c.params.after === "2" && c.params.limit === 10), "page 2 retried at limit=10");
        assert.ok(r.seeds[0].topPosts > 25, `paging went on after the failed page (got ${r.seeds[0].topPosts})`);
    });

    it("second research of the same seeds comes from cache (0 Meta calls)", async () => {
        const { researchProductHashtags } = load();
        await researchProductHashtags({}, { seedHashtags: ["coffee", "arabica"] });
        calls = [];
        const r = await researchProductHashtags({}, { seedHashtags: ["coffee", "arabica"] });
        assert.equal(calls.length, 0);
        assert.ok(r.seeds.every((s) => s.fromCache));
        assert.ok(r.hashtags.length > 0);
    });

    it("brand names are not searched (no quota spent on #ycoo)", async () => {
        const { researchProductHashtags } = load();
        const r = await researchProductHashtags({}, { seedHashtags: ["Ycoo", "coffee"], excludeSeeds: ["Ycoo"] });
        assert.ok(!calls.some((c) => c.params.q === "ycoo"));
        assert.deepEqual(r.seeds.map((s) => s.hashtag), ["#coffee"]);
    });

    it("progress: every seed reports done + partial hashtags", async () => {
        const { researchProductHashtags } = load();
        const snaps = [];
        await researchProductHashtags({}, { seedHashtags: ["coffee", "arabica"], onProgress: (p) => snaps.push(p) });
        const last = snaps.at(-1);
        assert.ok(last.seeds.every((s) => s.status === "done"));
        assert.ok(last.partialHashtags.length > 0);
        assert.ok(snaps.some((p) => p.seeds.some((s) => s.status === "fetching")));
    });

    it("rate limit (429) -> waits and retries instead of failing", async () => {
        behaviour.rateLimitOnce = true;
        const { researchProductHashtags } = load();
        const r = await researchProductHashtags({}, { seedHashtags: ["coffee"] });
        assert.equal(r.status, "success");
        assert.ok(behaviour.rateLimited);
    });

    it("Hashtags page (full mode) still gets thumbnails, and falls back when Meta says 'reduce data'", async () => {
        const { exploreHashtags } = load();
        const r = await exploreHashtags({ seeds: ["coffee", "popular"] });
        assert.ok(mediaCalls().some((c) => c.params.fields.includes("media_url")));
        assert.ok(r.topPosts.length > 0);
        assert.ok(r.seeds.find((s) => s.hashtag === "#popular").topPosts > 0);
    });

    it("new hashtag searches never run at the same time (weekly quota stays exact)", async () => {
        const { getHashtagId } = (load(), require("../../services/instagramService.js"));
        let searching = 0, maxSearching = 0;
        const orig = axios.get;
        axios.get = async (url, opts) => {
            if (url.endsWith("/ig_hashtag_search")) { searching++; maxSearching = Math.max(maxSearching, searching); }
            try { return await orig(url, opts); } finally { if (url.endsWith("/ig_hashtag_search")) searching--; }
        };
        try {
            await Promise.all(["a1", "b2", "c3", "d4", "a1"].map((t) => getHashtagId(t)));
        } finally {
            axios.get = orig;
        }
        assert.equal(maxSearching, 1);
        assert.equal(calls.filter((c) => c.url.endsWith("/ig_hashtag_search")).length, 4, "a1 searched once");
    });
});

describe("draft -> refine: live hashtags for a draft", () => {
    const { pickLiveHashtags } = require("../../ai/marketResearch/platforms/instagram/InstagramLiveHashtags.js");
    const research = { hashtags: ["#coffee", "#morningvibes", "#arabicabeans", "#filtercoffee", "#latteart", "#cafe", "#brew"].map((hashtag) => ({ hashtag })) };

    it("keeps the draft's real hashtags first, drops invented ones, max 5", () => {
        const picked = pickLiveHashtags({ draft: ["#Coffee", "#madeUpTag"], research, brief: { importantWords: ["arabica"] }, caption: "" });
        assert.equal(picked[0], "#coffee");
        assert.ok(!picked.includes("#madeuptag"));
        assert.ok(picked.length <= 5);
    });

    it("prefers live hashtags that match the brief's important words", () => {
        const picked = pickLiveHashtags({ draft: [], research, brief: { importantWords: ["filter coffee", "arabica"] } });
        assert.deepEqual(picked.slice(0, 3), ["#coffee", "#arabicabeans", "#filtercoffee"]);
    });

    it("no live data -> empty (the AI hashtags stay)", () => {
        assert.deepEqual(pickLiveHashtags({ draft: ["#a"], research: { hashtags: [] } }), []);
    });
});
