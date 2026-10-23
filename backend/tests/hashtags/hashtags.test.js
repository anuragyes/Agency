// node --test tests/hashtags/hashtags.test.js — platform registry + result builder (no network)
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { getProvider, listPlatforms } = require("../../services/hashtags");
const { defineProvider } = require("../../services/hashtags/providerContract.js");
const { buildHashtagResult } = require("../../services/hashtags/buildHashtagResult.js");

describe("hashtag platforms", () => {
    it("lists every platform, Instagram live first", () => {
        const list = listPlatforms();
        assert.equal(list[0].id, "instagram");
        assert.equal(list[0].implemented, true);
        assert.ok(list.some((p) => p.id === "youtube" && p.implemented === false));
        list.forEach((p) => assert.equal(typeof p.name, "string"));
    });

    it("unknown platform -> 404", () => {
        assert.throws(() => getProvider("myspace"), (e) => e.statusCode === 404);
    });

    it("platform without an API yet -> 501", async () => {
        await assert.rejects(getProvider("youtube").explore({ seeds: "ghee" }), (e) => e.statusCode === 501);
        await assert.rejects(getProvider("tiktok").explore({ seeds: "ghee" }), (e) => e.statusCode === 501);
    });

    it("implemented but missing credentials -> 503", async () => {
        const p = defineProvider({ id: "demo", name: "Demo", envVars: ["__NOT_SET_DEMO_KEY__"], explore: async () => ({}) });
        assert.equal(p.info().implemented, true);
        assert.equal(p.info().configured, false);
        await assert.rejects(p.explore({ seeds: "a" }), (e) => e.statusCode === 503);
    });

    it("adding explore() makes a platform live and tags the result", async () => {
        const p = defineProvider({ id: "demo", name: "Demo", isConfigured: () => true, explore: async () => ({ hashtags: [] }) });
        const r = await p.explore({ seeds: "a" });
        assert.equal(r.platform, "demo");
        assert.equal(r.mode, "explore");
        assert.equal(r.success, true);
    });
});

describe("buildHashtagResult", () => {
    it("ranks hashtags from real posts of any platform", () => {
        const r = buildHashtagResult({
            source: "Test API",
            seeds: ["ghee"],
            seedStats: [{ hashtag: "#ghee", found: true, topPosts: 2, recentPosts24h: 1 }],
            groups: [
                { seed: "ghee", edge: "top", posts: [
                    { id: "1", caption: "pure #ghee #desighee", likes: 100, comments: 10, timestamp: "2026-10-01T00:00:00Z" },
                    { id: "2", caption: "#ghee", hashtags: ["#A2Ghee"], likes: 50, comments: 5, timestamp: "2026-10-02T00:00:00Z" },
                ] },
                { seed: "ghee", edge: "recent", posts: [
                    { id: "2", caption: "#ghee", hashtags: ["a2ghee"], likes: 50, comments: 5, timestamp: "2026-10-02T00:00:00Z" },
                ] },
            ],
        });
        const tags = r.hashtags.map((h) => h.hashtag);
        assert.ok(tags.includes("#ghee"));
        assert.ok(!tags.includes("#desighee"), "#desighee is in only 1 post -> removed as one-off");
        assert.equal(r.removed.oneOff, 2);
        assert.equal(r.hashtags.find((h) => h.hashtag === "#ghee").isSeed, true);
        assert.equal(r.topPosts.length, 2);
        assert.equal(r.recentPosts.length, 1);
        assert.equal(r.topPosts[0].id, "1"); // highest engagement first
        assert.equal(r.mediaAnalyzed, 3);
        assert.equal(r.status, "success");
    });
});

describe("hashtag quality (only real hashtags)", () => {
    const { rankHashtagsWithQuality, removedNote } = require("../../services/hashtags/hashtagQuality.js");
    const m = (id, caption, likes = 100, comments = 5) => ({ id, caption, like_count: likes, comments_count: comments });

    // Same pattern as a real #minimalist search: a few real related tags + lots of noise
    const groups = [
        { seed: "minimalist", edge: "top_media", media: [
            m("t1", "Clean lines today #minimalist #minimalism #design", 1500, 40),
            m("t2", "Less is more in this room #minimalist #minimalism #interiordesign", 900, 20),
            m("t3", "Morning light study #minimalist #minimalism #design #photography", 700, 9),
            m("t4", "비움의 즐거움 #minimalist #미니멀라이프 #미니멀리스트 #비움 #minimallife", 1383, 43),
            m("t5", "Tokyo house visit #minimalist #japan #madrid #minimalarchitecture #japanesearchitecture", 1809, 11),
            m("t6", "Abstract lines #minimalist #design #minimalism", 400, 3),
        ] },
        { seed: "minimalist", edge: "recent_media", media: [
            // spam account: same caption + same hashtag block posted 5 times
            ...[1, 2, 3, 4, 5].map((i) => m(`s${i}`, "Glow up skin now!! #minimalist #fyp #skincareroutine #viral", 0, 0)),
            m("r1", "New piece in the studio #minimalist #minimalism", 3, 0),
            m("r2", "Desk setup #minimalist #fyp #interiordesign", 2, 0),
        ] },
    ];
    const { hashtags, removed } = rankHashtagsWithQuality(groups, ["minimalist"]);
    const tags = hashtags.map((h) => h.hashtag);

    it("keeps the seed and real related hashtags, best first", () => {
        assert.equal(tags[0], "#minimalist");
        assert.equal(tags[1], "#minimalism");
        assert.ok(tags.includes("#design"));
        assert.ok(tags.includes("#interiordesign"));
    });

    it("removes spam / generic tags like #fyp and #viral", () => {
        assert.ok(!tags.includes("#fyp"));
        assert.ok(!tags.includes("#viral"));
        assert.ok(removed.spam >= 2);
    });

    it("counts copies of the same spam post once -> #skincareroutine is removed", () => {
        assert.ok(!tags.includes("#skincareroutine"));
    });

    it("removes one-off tags that came from a single post", () => {
        for (const t of ["#미니멀라이프", "#비움", "#japan", "#madrid", "#minimalarchitecture", "#photography"]) {
            assert.ok(!tags.includes(t), `${t} should be removed`);
        }
        assert.ok(removed.oneOff > 0);
        assert.match(removedNote(removed), /Removed \d+ unrelated hashtags/);
    });

    it("posts = different posts, not copies", () => {
        const seed = hashtags.find((h) => h.hashtag === "#minimalist");
        assert.equal(seed.rawPosts, 13);
        assert.equal(seed.posts, 9); // 5 spam copies -> 1
    });

    it("tags that only appear together in the same posts become one row", () => {
        const r = rankHashtagsWithQuality([{ seed: "ghee", edge: "top_media", media: [
            m("a", "Pure taste one #ghee #desighee #a2ghee #homemade", 50, 1),
            m("b", "Pure taste two different words #ghee #desighee #a2ghee #homemade #extra", 60, 2),
        ] }], ["ghee"]);
        const row = r.hashtags.find((h) => h.hashtag === "#a2ghee");
        assert.ok(row, "#a2ghee kept (contains the seed, shortest)");
        assert.deepEqual(row.similar.sort(), ["#desighee", "#homemade"]);
        assert.ok(!r.hashtags.some((h) => h.hashtag === "#desighee" || h.hashtag === "#homemade"));
        assert.equal(r.removed.samePost, 2);
    });
});
