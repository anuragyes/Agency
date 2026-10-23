// ─────────────────────────────────────────────────────────────
// buildHashtagResult.js — turn REAL posts from any platform into the HashtagResult
// the Hashtags page understands. A new provider only has to:
//   1. call its platform API for each seed hashtag (top posts + recent posts)
//   2. map every post to the Post shape (see providerContract.js)
//   3. return buildHashtagResult({ ... })
// Ranking + noise removal is the same as Instagram (hashtagQuality.js): only hashtags used in
// several different posts, no spam tags, copies of a post counted once.
// ─────────────────────────────────────────────────────────────
const { normalizeHashtag, extractHashtags } = require("../instagramService.js");
const { rankHashtagsWithQuality, removedNote } = require("./hashtagQuality.js");

const EDGE = { top: "top_media", recent: "recent_media" };

/**
 * @param {Object}  args
 * @param {string}  args.source       e.g. "YouTube Data API v3"
 * @param {string[]} args.seeds       normalized seed hashtags, e.g. ["ghee", "desighee"]
 * @param {Array}   args.seedStats    one entry per seed (see providerContract.js)
 * @param {Array<{seed:string, edge:"top"|"recent", posts:Array}>} args.groups
 * @param {string[]} [args.limitations]
 * @param {Object}  [args.quota]
 * @param {number}  [args.maxResults]
 */
const buildHashtagResult = ({ source, seeds = [], seedStats = [], groups = [], limitations = [], quota = null, maxResults = 150 }) => {
    // 1. rank hashtags + remove noise (works on { id, caption, like_count, comments_count })
    const rankGroups = groups.map((g) => ({
        seed: normalizeHashtag(g.seed),
        edge: EDGE[g.edge] || g.edge,
        media: (g.posts || []).map((p) => ({
            id: p.id,
            caption: [p.caption || "", ...(p.hashtags || []).map((h) => `#${normalizeHashtag(h)}`)].join(" "),
            like_count: p.likes,
            comments_count: p.comments,
        })),
    }));
    const ranked = rankHashtagsWithQuality(rankGroups, seeds);
    const hashtags = ranked.hashtags.slice(0, maxResults);
    const note = removedNote(ranked.removed);

    // 2. one entry per post, remembering which seed(s) / edge(s) it came from
    const posts = new Map();
    for (const g of groups) {
        for (const p of g.posts || []) {
            const tags = [...new Set([...extractHashtags(p.caption), ...(p.hashtags || []).map(normalizeHashtag)])].filter(Boolean);
            const prev = posts.get(p.id) || {
                ...p,
                caption: p.caption || "",
                hashtags: tags.map((t) => `#${t}`),
                engagement: p.likes == null && p.comments == null ? null : (p.likes || 0) + (p.comments || 0),
                seeds: [], inTop: false, inRecent: false,
            };
            const seedTag = `#${normalizeHashtag(g.seed)}`;
            if (!prev.seeds.includes(seedTag)) prev.seeds.push(seedTag);
            if (g.edge === "top") prev.inTop = true;
            if (g.edge === "recent") prev.inRecent = true;
            posts.set(p.id, prev);
        }
    }
    const allPosts = [...posts.values()];

    return {
        status: seedStats.some((s) => s.error) ? "partial" : "success",
        seeds: seedStats,
        hashtags,
        topPosts: allPosts.filter((p) => p.inTop).sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1)),
        recentPosts: allPosts.filter((p) => p.inRecent).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        mediaAnalyzed: groups.reduce((n, g) => n + (g.posts || []).length, 0),
        quota,
        removed: ranked.removed,
        limitations: note ? [note, ...limitations] : limitations,
        source,
        fetchedAt: new Date().toISOString(),
    };
};

module.exports = { buildHashtagResult };
