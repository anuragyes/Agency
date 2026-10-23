// ─────────────────────────────────────────────────────────────
// Competitor Performance Agent (skill: competitor-performance.md) — NO LLM
//   analyzed accounts (competitorAnalysis.analyzeAccount) + per-post rows (Post Analysis)
//   -> score 0-100, tier, consistency, momentum, conversation rate, patterns of the leaders
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, mean, median, stdev, clamp } = require("../textUtils.js");

/** percentile rank 0..1 of v inside values (ties = average) */
const pctRank = (values, v) => {
    const a = values.filter((x) => x != null);
    if (v == null || a.length <= 1) return a.length === 1 && v != null ? 0.5 : 0;
    const below = a.filter((x) => x < v).length;
    const equal = a.filter((x) => x === v).length;
    return (below + (equal - 1) / 2) / (a.length - 1);
};

const accountMetrics = (acc, rows, cfg, isYou = false) => {
    const mine = rows.filter((r) => r.username === acc.profile.username).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const ers = mine.map((r) => r.er).filter((v) => v != null);
    const m = mean(ers);
    const cv = m ? stdev(ers) / m : null;
    let momentum = null;
    if (ers.length >= (cfg.minPostsForMomentum || 6)) {
        const half = Math.floor(mine.length / 2);
        const older = mean(mine.slice(0, half).map((r) => r.er)), newer = mean(mine.slice(half).map((r) => r.er));
        momentum = older ? round(((newer - older) / older) * 100) : null;
    }
    const likes = mine.reduce((n, r) => n + (r.likes || 0), 0);
    const comments = mine.reduce((n, r) => n + (r.comments || 0), 0);
    const share = (pred) => round((mine.filter(pred).length / Math.max(1, mine.length)) * 100);
    return {
        username: acc.profile.username, name: acc.profile.name, profilePictureUrl: acc.profile.profilePictureUrl,
        isYou,
        followers: acc.profile.followers, postsAnalyzed: acc.postsAnalyzed,
        engagementRate: acc.engagementRate, avgEngagement: acc.avgEngagement, avgLikes: acc.avgLikes, avgComments: acc.avgComments,
        postsPerWeek: acc.postsPerWeek,
        consistency: cv == null ? null : round(clamp(100 - cv * 50)),
        momentum,
        conversationRate: likes ? round((comments / likes) * 100, 2) : null,
        outliers: mine.filter((r) => r.pi != null && r.pi >= 2.5).length,
        bestFormat: acc.bestFormat,
        mix: { reel: share((r) => r.format === "reel"), carousel: share((r) => r.format === "carousel"), image: share((r) => r.format === "image"), video: share((r) => r.format === "video") },
        questionShare: share((r) => r.hasQuestion), ctaShare: share((r) => r.hasCta),
        avgHashtags: acc.captions?.avgHashtags ?? null, avgCaptionLength: acc.captions?.avgLength ?? null,
        // engagement per post over time (oldest -> newest) for the sparkline
        trend: mine.map((r) => round(r.er, 3)).filter((v) => v != null),
    };
};

const PATTERN_FIELDS = [
    ["reelShare", "Reels share of posts", "%", (a) => a.mix.reel],
    ["carouselShare", "Carousel share of posts", "%", (a) => a.mix.carousel],
    ["postsPerWeek", "Posts per week", "", (a) => a.postsPerWeek],
    ["questionShare", "Captions with a question", "%", (a) => a.questionShare],
    ["ctaShare", "Captions with a call to action", "%", (a) => a.ctaShare],
    ["avgHashtags", "Hashtags per post", "", (a) => a.avgHashtags],
    ["avgCaptionLength", "Caption length (chars)", "", (a) => a.avgCaptionLength],
];

const runPerformance = ({ accounts = [], me = null, rows = [], meRows = [] } = {}) => {
    const cfg = skillConfig("competitor_performance");
    const w = cfg.weights || {};
    const list = accounts.map((a) => accountMetrics(a, rows, cfg));
    const you = me ? accountMetrics(me, meRows, cfg, true) : null;
    const all = you ? [...list, you] : list;

    const cols = {
        engagementRate: all.map((a) => a.engagementRate), momentum: all.map((a) => a.momentum),
        frequency: all.map((a) => a.postsPerWeek), consistency: all.map((a) => a.consistency), conversation: all.map((a) => a.conversationRate),
    };
    const val = { engagementRate: (a) => a.engagementRate, momentum: (a) => a.momentum, frequency: (a) => a.postsPerWeek, consistency: (a) => a.consistency, conversation: (a) => a.conversationRate };
    for (const a of all) {
        let sum = 0, wsum = 0;
        const parts = {};
        for (const [k, weight] of Object.entries(w)) {
            if (val[k](a) == null) continue;
            parts[k] = round(pctRank(cols[k], val[k](a)) * 100);
            sum += parts[k] * weight; wsum += weight;
        }
        a.scoreParts = parts;
        a.score = wsum ? round(sum / wsum) : null;
    }
    const ranked = [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const q = Math.max(1, Math.round(ranked.length / 4));
    ranked.forEach((a, i) => { a.rank = i + 1; a.tier = i < q ? "Leader" : i >= ranked.length - q && ranked.length >= 4 ? "Follower" : "Challenger"; });
    if (you) you.rank = [...ranked, you].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).indexOf(you) + 1;

    // what leaders do differently
    const leaders = ranked.slice(0, q), rest = ranked.slice(q);
    const patterns = rest.length ? PATTERN_FIELDS.map(([key, label, unit, f]) => {
        const L = round(mean(leaders.map(f)), 1), R = round(mean(rest.map(f)), 1);
        return { key, label, unit, leaders: L, rest: R, diff: L != null && R != null ? round(L - R, 1) : null };
    }).filter((p) => p.diff != null && Math.abs(p.diff) >= (p.unit === "%" ? 10 : 1)) : [];

    return {
        accounts: ranked,
        you,
        leaders: leaders.map((a) => a.username),
        patterns,
        medians: {
            engagementRate: round(median(list.map((a) => a.engagementRate)), 2),
            postsPerWeek: round(median(list.map((a) => a.postsPerWeek)), 1),
            conversationRate: round(median(list.map((a) => a.conversationRate)), 2),
            avgComments: round(median(list.map((a) => a.avgComments)), 1),
        },
    };
};

module.exports = { runPerformance, pctRank };
