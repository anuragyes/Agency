// ─────────────────────────────────────────────────────────────
// Post Analysis Agent (skill: ai/competitorIntelligence/skills/post-analysis.md) — NO LLM
//   rawAccounts [{ profile, recentPosts }]  (real Business Discovery data)
//   -> per-post rows + post insights (themes, formats, hooks, captions, timing, outliers)
// Performance index (pi) = post ER / that account's median post ER  (1.0 = a typical post),
// so a 5K-follower brand and a 2M-follower brand can be compared fairly.
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { formatOf } = require("../../competitors/competitorAnalysis.js");
const { round, mean, median, norm, countMatches, captionText, hookOf, hookType, brandText, tokens } = require("../textUtils.js");

const TZ = process.env.REPORT_TIMEZONE || "Asia/Kolkata";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["00–03", "03–06", "06–09", "09–12", "12–15", "15–18", "18–21", "21–24"];
const CTA = /(link in bio|shop now|order now|buy now|\bdm\b|comment below|comment ['"]?\w+['"]? |tag (a|your)|click|swipe|save this|share this|visit|use code|limited|offer|discount|sale)/i;

const localParts = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
    const day = parts.find((x) => x.type === "weekday")?.value;
    const hour = Number(parts.find((x) => x.type === "hour")?.value) % 24;
    return { day, hour, slot: Math.floor(hour / 3) };
};

const bucketOf = (buckets, v) => (buckets.find(([lo, hi]) => v >= lo && v < hi) || buckets[buckets.length - 1])[2];

/** brand context -> its own "Product" theme terms (brand keywords) */
const productTerms = (brand = {}) => [...new Set([...(brand.keywords || []), brand.name, ...(String(brand.category || "").split(/[>\/,&|]+/))]
    .map((s) => String(s || "").trim().toLowerCase()).filter((s) => s.length >= 3))].slice(0, 25);

/** one tagged post */
const tagPost = (p, account, cfg, extraThemes) => {
    const text = norm(captionText(p.caption));
    const themes = Object.entries({ ...cfg.themes, ...extraThemes })
        .filter(([, terms]) => countMatches(text, terms) > 0).map(([name]) => name);
    const hook = hookOf(p.caption);
    const lp = localParts(p.timestamp);
    const followers = account.profile?.followers || null;
    return {
        id: p.id,
        username: account.profile?.username,
        format: formatOf(p),
        themes: themes.length ? themes : ["Other"],
        hook,
        hookType: hookType(hook),
        captionLength: captionText(p.caption).length,
        hashtagCount: (p.hashtags || []).length,
        hasQuestion: captionText(p.caption).includes("?"),
        hasCta: CTA.test(captionText(p.caption)),
        likes: p.likes, comments: p.comments, engagement: p.engagement,
        er: followers && p.engagement != null ? (p.engagement / followers) * 100 : null,
        day: lp?.day || null, slot: lp ? lp.slot : null,
        timestamp: p.timestamp, permalink: p.permalink, imageUrl: p.imageUrl || null,
    };
};

/** group rows -> stats, best first by performance index */
const groupBy = (rows, keyFn, { accountsTotal, minPosts = 1 } = {}) => {
    const m = new Map();
    for (const r of rows) {
        for (const k of [].concat(keyFn(r)).filter((x) => x != null)) {
            const s = m.get(k) || { key: k, rows: [] };
            s.rows.push(r);
            m.set(k, s);
        }
    }
    return [...m.values()].map((s) => {
        const accounts = new Set(s.rows.map((r) => r.username));
        const likes = s.rows.reduce((n, r) => n + (r.likes || 0), 0);
        const comments = s.rows.reduce((n, r) => n + (r.comments || 0), 0);
        return {
            key: s.key,
            posts: s.rows.length,
            share: round((s.rows.length / Math.max(1, rows.length)) * 100),
            accounts: accounts.size,
            accountShare: accountsTotal ? round(accounts.size / accountsTotal, 2) : null,
            usedBy: [...accounts],
            avgER: round(mean(s.rows.map((r) => r.er)), 3),
            performanceIndex: round(mean(s.rows.map((r) => r.pi)), 2),
            commentsPer100Likes: likes ? round((comments / likes) * 100, 1) : null,
            reliable: s.rows.length >= minPosts,
        };
    }).sort((a, b) => (b.performanceIndex ?? -1) - (a.performanceIndex ?? -1));
};

const runPostAnalysis = ({ rawAccounts = [], brand = {} } = {}) => {
    const cfg = skillConfig("post_analysis");
    const minPosts = cfg.minPostsPerBucket || 3;
    const extraThemes = { Product: productTerms(brand) };

    // 1. tag every post
    const rows = [];
    for (const acc of rawAccounts) {
        const accRows = (acc.recentPosts || []).map((p) => tagPost(p, acc, cfg, extraThemes));
        const med = median(accRows.map((r) => r.er)) || median(accRows.map((r) => r.engagement));
        accRows.forEach((r) => {
            const base = r.er != null ? r.er : r.engagement;
            r.pi = med && base != null ? round(base / med, 3) : null;
        });
        rows.push(...accRows);
    }
    const accountsTotal = rawAccounts.length;
    const opts = { accountsTotal, minPosts };

    // 2. insights
    const themes = groupBy(rows, (r) => r.themes, opts);
    const formats = groupBy(rows, (r) => r.format, opts);
    const hooks = groupBy(rows, (r) => r.hookType, opts);
    const captionLength = groupBy(rows, (r) => bucketOf(cfg.captionBuckets, r.captionLength), opts);
    const hashtagCount = groupBy(rows, (r) => bucketOf(cfg.hashtagBuckets, r.hashtagCount), opts);
    const question = groupBy(rows, (r) => (r.hasQuestion ? "With question" : "No question"), opts);
    const cta = groupBy(rows, (r) => (r.hasCta ? "With CTA" : "No CTA"), opts);

    // 3. format mix per account (for the stacked bar chart)
    const formatMix = rawAccounts.map((acc) => {
        const mine = rows.filter((r) => r.username === acc.profile?.username);
        const mix = {};
        mine.forEach((r) => { mix[r.format] = (mix[r.format] || 0) + 1; });
        Object.keys(mix).forEach((k) => { mix[k] = round((mix[k] / Math.max(1, mine.length)) * 100); });
        return { username: acc.profile?.username, posts: mine.length, mix };
    });

    // 4. day x 3h-slot heatmap
    const heat = DAYS.map((day) => SLOTS.map((_, slot) => {
        const cell = rows.filter((r) => r.day === day && r.slot === slot);
        return { posts: cell.length, performanceIndex: round(mean(cell.map((r) => r.pi)), 2) };
    }));

    // 5. outliers (viral posts): pi >= multiplier
    const mult = cfg.outlierMultiplier || 2.5;
    const outliers = rows.filter((r) => r.pi != null && r.pi >= mult).sort((a, b) => b.pi - a.pi).slice(0, 12)
        .map(({ id, username, format, themes: th, hook, hookType: ht, likes, comments, er, pi, permalink, imageUrl, timestamp }) =>
            ({ id, username, format, themes: th, hook, hookType: ht, likes, comments, er: round(er, 3), multiple: round(pi, 1), permalink, imageUrl, timestamp }));

    // 6. top caption words of the best posts vs all (what top posts talk about)
    const best = [...rows].filter((r) => r.pi != null).sort((a, b) => b.pi - a.pi).slice(0, Math.max(5, Math.round(rows.length * 0.2)));
    const freq = (list) => { const m = new Map(); list.forEach((r) => new Set(tokens(r.hook)).forEach((w) => m.set(w, (m.get(w) || 0) + 1))); return m; };
    const bestWords = freq(best);
    const topWords = [...bestWords.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([term, count]) => ({ term, count }));

    return {
        totals: { posts: rows.length, accounts: accountsTotal, withER: rows.filter((r) => r.er != null).length, avgER: round(mean(rows.map((r) => r.er)), 3) },
        themes, formats, hooks, captionLength, hashtagCount, question, cta,
        formatMix,
        heatmap: { days: DAYS, slots: SLOTS, cells: heat, timezone: TZ },
        outliers,
        topWords,
        rows, // kept in memory for the next agents; stripped before saving (see orchestrator)
    };
};

module.exports = { runPostAnalysis, tagPost, groupBy, DAYS, SLOTS, localParts };
