// ─────────────────────────────────────────────────────────────
// hashtagQuality.js — keep only REAL hashtags that people actually use with your keyword.
//
// Raw data = every hashtag written in the sampled posts. That is noisy:
//   • one post with 15 tags adds 15 "results" (#japan #madrid ... under #minimalist)
//   • spam accounts post the same caption / same hashtag block many times
//   • growth-hack tags (#fyp #viral #explorepage #like4like) are on everything
// This file removes that noise. Still 100% real API data — nothing is invented.
//
//   rankHashtagsWithQuality(groups, seeds) -> { hashtags: [...clean, ranked], removed: { oneOff, spam, samePost } }
//   groups = [{ seed, edge: "top_media" | "recent_media", media: [{ id, caption, like_count, comments_count }] }]
// ─────────────────────────────────────────────────────────────
const { extractHashtags, normalizeHashtag } = require("../instagramService.js");

// A hashtag must be used in at least this many DIFFERENT posts (copies of one post count once)
const MIN_SOURCES = Math.max(1, Number(process.env.HASHTAG_MIN_POSTS) || 2);
// Posts stuffed with more hashtags than this count less
const STUFFED_POST_TAGS = 15;

// Growth-hack / generic tags that say nothing about the topic. Add more with HASHTAG_BLOCKLIST=a,b,c in .env
const BLOCKLIST = new Set([
    "fyp", "foryou", "foryoupage", "fypシ", "bhfyp", "viral", "viralpost", "viralreels", "trending", "trend",
    "explore", "explorepage", "explorer", "instagood", "instadaily", "instagram", "insta", "ig", "igers",
    "photooftheday", "picoftheday", "love", "like", "likes", "follow", "followme", "followback",
    "like4like", "likeforlike", "likeforlikes", "l4l", "follow4follow", "followforfollow", "f4f",
    "comment4comment", "c4c", "s4s", "tagsforlikes", "likes4likes", "reels", "reel", "reelsinstagram",
    "reelitfeelit", "reelkarofeelkaro", "trendingreels", "instareels", "xyzbca", "tiktok", "youtube",
    "shorts", "ytshorts", "post", "new", "today", "daily", "repost",
    ...String(process.env.HASHTAG_BLOCKLIST || "").split(","),
].map(normalizeHashtag).filter(Boolean));
const BLOCK_PATTERNS = [
    /^fyp/, /^foryou/, /^explorepage/, /^viral/, /^trending/,
    /(like|follow|comment|share)(4|for|to)(like|follow|comment|share)/,
];
const isSpamHashtag = (tag) => BLOCKLIST.has(tag) || BLOCK_PATTERNS.some((r) => r.test(tag));

/** Caption text without hashtags / mentions — same text = same post copied */
const captionKey = (caption) => String(caption || "")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@[\p{L}\p{N}_.]+/gu, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 80);

const avg = (sum, n) => (n ? Math.round(sum / n) : null);

const rankHashtagsWithQuality = (groups = [], seeds = [], { minSources = MIN_SOURCES } = {}) => {
    const seedSet = new Set(seeds.map(normalizeHashtag));

    // 1. unique posts (a post can come from several seeds / edges)
    const posts = new Map();
    for (const { seed, edge, media } of groups) {
        for (const m of media || []) {
            if (!m?.id) continue;
            const p = posts.get(m.id) || {
                id: m.id,
                caption: m.caption,
                tags: extractHashtags(m.caption),
                likes: Number.isFinite(m.like_count) ? m.like_count : null,
                comments: Number.isFinite(m.comments_count) ? m.comments_count : null,
                inTop: false, inRecent: false, seeds: new Set(),
            };
            if (edge === "top_media") p.inTop = true;
            if (edge === "recent_media") p.inRecent = true;
            p.seeds.add(normalizeHashtag(seed));
            posts.set(m.id, p);
        }
    }

    // 2. "sources": posts with the same caption text or the same hashtag block are one source (copies / spam)
    const keyToSource = new Map();
    const sourceTags = new Map(); // source -> max hashtags in one of its posts
    let nextSource = 0;
    for (const p of posts.values()) {
        const keys = [];
        const ck = captionKey(p.caption);
        if (ck.length >= 12) keys.push(`c:${ck}`);
        if (p.tags.length >= 5) keys.push(`t:${[...p.tags].sort().join(" ")}`); // long identical tag blocks = copy-paste spam
        let source = keys.map((k) => keyToSource.get(k)).find((v) => v !== undefined);
        if (source === undefined) source = nextSource++;
        keys.forEach((k) => keyToSource.set(k, source));
        p.source = source;
        sourceTags.set(source, Math.max(sourceTags.get(source) || 0, p.tags.length));
    }
    const sourceWeight = (s) => Math.min(1, STUFFED_POST_TAGS / Math.max(1, sourceTags.get(s)));

    // 3. stats per hashtag
    const stats = new Map();
    for (const p of posts.values()) {
        for (const tag of p.tags) {
            const s = stats.get(tag) || {
                tag, postIds: new Set(), sources: new Set(), topSources: new Set(), recentSources: new Set(),
                topPosts: 0, recentPosts24h: 0, likes: 0, likeSamples: 0, comments: 0, commentSamples: 0, seenWith: new Set(),
            };
            s.postIds.add(p.id);
            s.sources.add(p.source);
            if (p.inTop) { s.topPosts++; s.topSources.add(p.source); }
            if (p.inRecent) { s.recentPosts24h++; s.recentSources.add(p.source); }
            if (p.likes != null) { s.likes += p.likes; s.likeSamples++; }
            if (p.comments != null) { s.comments += p.comments; s.commentSamples++; }
            p.seeds.forEach((x) => s.seenWith.add(x));
            stats.set(tag, s);
        }
    }

    // 4. score: used in many DIFFERENT posts >> in top posts >> recent >> engagement (only once it repeats)
    const removed = { oneOff: 0, spam: 0, samePost: 0 };
    let rows = [...stats.values()].map((s) => {
        const n = s.sources.size;
        const weighted = [...s.sources].reduce((a, src) => a + sourceWeight(src), 0);
        const avgLikes = avg(s.likes, s.likeSamples);
        const avgComments = avg(s.comments, s.commentSamples);
        const confidence = Math.min(1, (n - 1) / 2); // 0 for a one-post hashtag, 1 from 3 posts
        const score = weighted * 3 + s.topSources.size * 1.5 + s.recentSources.size * 0.5
            + (s.seenWith.size - 1) * 3 + Math.log10(1 + (avgLikes || 0) + (avgComments || 0)) * confidence;
        return {
            hashtag: `#${s.tag}`,
            score: Math.round(score * 10) / 10,
            posts: n,                       // different posts (copies counted once)
            rawPosts: s.postIds.size,
            topPosts: s.topSources.size,
            recentPosts24h: s.recentSources.size,
            avgLikes,
            avgComments,
            seenWith: [...s.seenWith].map((t) => `#${t}`),
            isSeed: seedSet.has(s.tag),
            _key: [...s.sources].sort((a, b) => a - b).join(","),
            _tag: s.tag,
        };
    });

    // 5. remove noise (your own seed hashtags always stay)
    rows = rows.filter((h) => {
        if (h.isSeed) return true;
        if (isSpamHashtag(h._tag)) { removed.spam++; return false; }
        if (h.posts < minSources) { removed.oneOff++; return false; }
        return true;
    });

    // 6. tags that only ever appear together in the same 1–2 posts = one row (+ "similar")
    const groupsByPosts = new Map();
    rows.filter((h) => !h.isSeed && h.posts <= 2).forEach((h) => {
        groupsByPosts.set(h._key, [...(groupsByPosts.get(h._key) || []), h]);
    });
    const drop = new Set();
    const seedParts = [...seedSet].filter((s) => s.length >= 4);
    for (const group of groupsByPosts.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) =>
            Number(seedParts.some((s) => b._tag.includes(s))) - Number(seedParts.some((s) => a._tag.includes(s)))
            || a._tag.length - b._tag.length || a._tag.localeCompare(b._tag));
        const [keep, ...rest] = group;
        keep.similar = rest.map((h) => h.hashtag);
        rest.forEach((h) => drop.add(h));
        removed.samePost += rest.length;
    }

    const hashtags = rows
        .filter((h) => !drop.has(h))
        .sort((a, b) => b.score - a.score || b.posts - a.posts)
        .map(({ _key, _tag, ...h }) => h);

    return { hashtags, removed: { ...removed, minPosts: minSources } };
};

/** One readable line for "About this data" */
const removedNote = ({ oneOff = 0, spam = 0, samePost = 0, minPosts = MIN_SOURCES } = {}) => {
    const total = oneOff + spam + samePost;
    if (!total) return null;
    const parts = [
        oneOff && `${oneOff} used in fewer than ${minPosts} different posts`,
        spam && `${spam} spam / generic tags like #fyp`,
        samePost && `${samePost} that only came from the same post as another tag`,
    ].filter(Boolean);
    return `Removed ${total} unrelated hashtags: ${parts.join(", ")}. Copies of the same post are counted once.`;
};

module.exports = { rankHashtagsWithQuality, removedNote, isSpamHashtag };
