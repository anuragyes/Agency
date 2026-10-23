// ─────────────────────────────────────────────────────────────
// competitorAnalysis.js — turns REAL posts into exact numbers. No LLM here.
//   analyzeAccount(account)          one account: engagement, formats, timing, captions, hashtags, top posts
//   compareAccounts(competitors, me) benchmarks + gaps (hashtags, formats, frequency, timing)
// account = { profile, recentPosts: [Post] } (Post = toPostView shape from instagramInsightsService.js)
// ─────────────────────────────────────────────────────────────
const { isSpamHashtag } = require("../hashtags/hashtagQuality.js");

const TZ = process.env.REPORT_TIMEZONE || "Asia/Kolkata";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CTA = /(link in bio|shop now|order now|buy now|\bdm\b|comment below|comment ['"]?\w+['"]? |tag (a|your)|click|swipe|save this|share this|visit|use code|limited|offer|discount|sale)/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const tagKey = (t) => String(t || "").toLowerCase().replace(/^#*/, "#");

/** reel | carousel | video | image | text (text = Facebook status / link post) */
const formatOf = (p) => {
    if (String(p.productType).toUpperCase() === "REELS") return "reel";
    if (p.mediaType === "TEXT") return "text";
    if (p.mediaType === "CAROUSEL_ALBUM") return "carousel";
    if (p.mediaType === "VIDEO") return "video";
    return "image";
};

const localParts = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
    const weekday = parts.find((x) => x.type === "weekday")?.value;
    const hour = Number(parts.find((x) => x.type === "hour")?.value);
    return { day: weekday, hour: Number.isFinite(hour) ? hour % 24 : null };
};

const captionText = (c) => String(c || "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();

/** group posts by key -> [{ key, posts, share, avgEngagement }] best first */
const groupStats = (posts, keyFn, total) => {
    const m = new Map();
    for (const p of posts) {
        const k = keyFn(p);
        if (k == null) continue;
        const s = m.get(k) || { key: k, posts: 0, eng: [] };
        s.posts++;
        if (p.engagement != null) s.eng.push(p.engagement);
        m.set(k, s);
    }
    return [...m.values()]
        .map((s) => ({ key: s.key, posts: s.posts, share: round((s.posts / Math.max(1, total)) * 100), avgEngagement: round(mean(s.eng)) }))
        .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));
};

const analyzeAccount = (account) => {
    const profile = account?.profile || {};
    const posts = (account?.recentPosts || []).filter(Boolean);
    const followers = profile.followers ?? null;
    const withEng = posts.filter((p) => p.engagement != null);

    const avgLikes = round(mean(withEng.map((p) => p.likes || 0)));
    const avgComments = round(mean(withEng.map((p) => p.comments || 0)));
    const avgEngagement = round(mean(withEng.map((p) => p.engagement)));

    // posting frequency over the period the sample covers
    const times = posts.map((p) => new Date(p.timestamp).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
    const spanDays = times.length >= 2 ? Math.max(1, (times[times.length - 1] - times[0]) / 86400000) : null;
    const postsPerWeek = spanDays ? round((posts.length / spanDays) * 7, 1) : null;

    const formats = groupStats(posts, formatOf, posts.length);
    const days = groupStats(posts, (p) => localParts(p.timestamp)?.day ?? null, posts.length);
    const hours = groupStats(posts, (p) => {
        const h = localParts(p.timestamp)?.hour;
        return h == null ? null : `${String(h - (h % 3)).padStart(2, "0")}:00–${String(h - (h % 3) + 3).padStart(2, "0")}:00`;
    }, posts.length);

    const caps = posts.map((p) => captionText(p.caption));
    const captions = {
        avgLength: round(mean(caps.map((c) => c.length))),
        avgHashtags: round(mean(posts.map((p) => (p.hashtags || []).length)), 1),
        withQuestion: round((caps.filter((c) => c.includes("?")).length / Math.max(1, posts.length)) * 100),
        withCallToAction: round((caps.filter((c) => CTA.test(c)).length / Math.max(1, posts.length)) * 100),
        withEmoji: round((caps.filter((c) => EMOJI.test(c)).length / Math.max(1, posts.length)) * 100),
    };

    // hashtags this account uses, with how those posts performed
    const tagMap = new Map();
    for (const p of posts) {
        for (const t of new Set((p.hashtags || []).map(tagKey))) {
            if (isSpamHashtag(t.slice(1))) continue;
            const s = tagMap.get(t) || { hashtag: t, posts: 0, eng: [] };
            s.posts++;
            if (p.engagement != null) s.eng.push(p.engagement);
            tagMap.set(t, s);
        }
    }
    const hashtags = [...tagMap.values()]
        .map((s) => ({ hashtag: s.hashtag, posts: s.posts, avgEngagement: round(mean(s.eng)) }))
        .sort((a, b) => b.posts - a.posts || (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0));

    const topPosts = [...withEng].sort((a, b) => b.engagement - a.engagement).slice(0, 3)
        .map((p) => ({ ...p, format: formatOf(p) }));

    return {
        profile: {
            username: profile.username, name: profile.name || "", profilePictureUrl: profile.profilePictureUrl || null,
            biography: profile.biography || "", website: profile.website || "",
            followers, following: profile.following ?? null, mediaCount: profile.mediaCount ?? null,
        },
        postsAnalyzed: posts.length,
        period: times.length ? { from: new Date(times[0]).toISOString(), to: new Date(times[times.length - 1]).toISOString() } : null,
        avgLikes, avgComments, avgEngagement,
        engagementRate: followers && avgEngagement != null ? round((avgEngagement / followers) * 100, 2) : null,
        postsPerWeek,
        formats,
        bestFormat: formats.find((f) => f.posts >= 2)?.key || formats[0]?.key || null,
        bestDays: days.filter((d) => d.posts >= 2).slice(0, 3),
        bestHours: hours.filter((h) => h.posts >= 2).slice(0, 3),
        captions,
        hashtags: hashtags.slice(0, 40),
        topPosts,
    };
};

/**
 * @param {Array} competitors analyzeAccount() results
 * @param {Object|null} me    analyzeAccount() of your own account (optional)
 */
const compareAccounts = (competitors = [], me = null) => {
    const avgOf = (key) => round(mean(competitors.map((c) => c[key]).filter((v) => v != null)), key === "engagementRate" ? 2 : 1);
    const benchmark = {
        competitors: {
            engagementRate: avgOf("engagementRate"),
            avgEngagement: avgOf("avgEngagement"),
            avgLikes: avgOf("avgLikes"),
            avgComments: avgOf("avgComments"),
            postsPerWeek: avgOf("postsPerWeek"),
            avgHashtags: round(mean(competitors.map((c) => c.captions?.avgHashtags).filter((v) => v != null)), 1),
        },
        me: me ? {
            engagementRate: me.engagementRate, avgEngagement: me.avgEngagement, avgLikes: me.avgLikes,
            avgComments: me.avgComments, postsPerWeek: me.postsPerWeek, avgHashtags: me.captions?.avgHashtags ?? null,
        } : null,
    };

    // brand hashtags (#amul for @amul_india) are useless for you -> left out of the gap
    const norm = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const brandKeys = [...competitors, ...(me ? [me] : [])].flatMap((c) => [
        norm(c.profile.username), norm(String(c.profile.username || "").split(/[._]/)[0]), norm(c.profile.name),
    ]).filter((k) => k.length >= 4);
    const isBrandTag = (tag) => { const t = norm(tag); return brandKeys.some((k) => t === k || t.startsWith(k)); };

    // hashtags: who uses what
    const mine = new Set((me?.hashtags || []).map((h) => h.hashtag));
    const tagMap = new Map();
    for (const c of competitors) {
        for (const h of c.hashtags || []) {
            const s = tagMap.get(h.hashtag) || { hashtag: h.hashtag, usedBy: [], posts: 0, engSum: 0, engN: 0 };
            s.usedBy.push(c.profile.username);
            s.posts += h.posts;
            if (h.avgEngagement != null) { s.engSum += h.avgEngagement * h.posts; s.engN += h.posts; }
            tagMap.set(h.hashtag, s);
        }
    }
    const tagRows = [...tagMap.values()].map((s) => ({
        hashtag: s.hashtag, usedBy: s.usedBy, competitorsUsing: s.usedBy.length, posts: s.posts,
        avgEngagement: s.engN ? round(s.engSum / s.engN) : null, youUse: mine.has(s.hashtag), brandTag: isBrandTag(s.hashtag),
    })).sort((a, b) => b.competitorsUsing - a.competitorsUsing || b.posts - a.posts || (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0));

    const hashtagGap = tagRows.filter((t) => !t.youUse && !t.brandTag && (t.competitorsUsing >= 2 || t.posts >= 2)).slice(0, 25);
    const sharedHashtags = tagRows.filter((t) => t.competitorsUsing >= 2 && !t.brandTag).slice(0, 25);
    const yourOnlyHashtags = (me?.hashtags || []).filter((h) => !tagMap.has(h.hashtag)).slice(0, 15);

    // formats: what works for competitors vs what you post
    const fmt = new Map();
    for (const c of competitors) {
        for (const f of c.formats || []) {
            const s = fmt.get(f.key) || { format: f.key, posts: 0, engSum: 0, engN: 0 };
            s.posts += f.posts;
            if (f.avgEngagement != null) { s.engSum += f.avgEngagement * f.posts; s.engN += f.posts; }
            fmt.set(f.key, s);
        }
    }
    const totalCompPosts = competitors.reduce((n, c) => n + c.postsAnalyzed, 0);
    const formatGap = [...fmt.values()].map((s) => ({
        format: s.format,
        competitorShare: round((s.posts / Math.max(1, totalCompPosts)) * 100),
        competitorAvgEngagement: s.engN ? round(s.engSum / s.engN) : null,
        yourShare: me ? (me.formats.find((f) => f.key === s.format)?.share ?? 0) : null,
        yourAvgEngagement: me ? (me.formats.find((f) => f.key === s.format)?.avgEngagement ?? null) : null,
    })).sort((a, b) => (b.competitorAvgEngagement ?? -1) - (a.competitorAvgEngagement ?? -1));

    // best days across competitors (posts-weighted)
    const dayMap = new Map();
    competitors.forEach((c) => (c.bestDays || []).forEach((d) => dayMap.set(d.key, (dayMap.get(d.key) || 0) + 1)));
    const commonBestDays = [...dayMap.entries()].sort((a, b) => b[1] - a[1]).map(([day, accounts]) => ({ day, accounts })).slice(0, 3);

    const topPosts = competitors
        .flatMap((c) => (c.topPosts || []).map((p) => ({ ...p, username: c.profile.username })))
        .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
        .slice(0, 9);

    const leader = [...competitors].filter((c) => c.engagementRate != null).sort((a, b) => b.engagementRate - a.engagementRate)[0];

    return {
        benchmark,
        leader: leader ? { username: leader.profile.username, engagementRate: leader.engagementRate } : null,
        hashtagGap,
        sharedHashtags,
        yourOnlyHashtags,
        formatGap,
        commonBestDays,
        topPosts,
        frequencyGap: me && benchmark.competitors.postsPerWeek != null && me.postsPerWeek != null
            ? round(benchmark.competitors.postsPerWeek - me.postsPerWeek, 1) : null,
    };
};

/** Every real hashtag seen in the data (the only hashtags the LLM may recommend) */
const allRealHashtags = (competitors = [], me = null) =>
    new Set([...competitors, ...(me ? [me] : [])].flatMap((a) => (a.hashtags || []).map((h) => h.hashtag)));

module.exports = { analyzeAccount, compareAccounts, allRealHashtags, formatOf, DAYS };







/*


2. Compare with code, no LLM: services/competitors/competitorAnalysis.js
This is where the actual evaluation happens. Look at these two functions:

analyzeAccount() works out these numbers for each account:
Average likes, comments and engagement (likes + comments).
Engagement rate = average engagement ÷ followers × 100.
Posts per week = number of posts ÷ the days they cover × 7.
Which format (reel, carousel or image) gets the best engagement, plus the best days and 3-hour time slots.
Caption habits: average length, % with a question, % with a call to action (CTA), % with emoji.
Hashtags used and how those posts performed, plus the top 3 posts.
compareAccounts() puts the accounts side by side:
Benchmark: competitor averages compared with yours.
Leader: the competitor with the highest engagement rate.
Hashtag gap: hashtags 2 or more competitors use that you don't. Brand hashtags like #amul are left out.
Format gap: the share of each format competitors post, and how it performs, compared with yours.
Frequency gap: how many posts per week you're behind or ahead.
Common best days: the days that come up most often across competitors.

3. The LLM writes the report: ai/competitorResearch/CompetitorReportAgent.js
This is the file to read for the LLM part.

buildPrompt() packs the numbers from step 2 into a small JSON. It also contains the system prompt, with rules like "use ONLY these numbers, every gap/action must quote evidence, don't invent hashtags."
Gemini runs at temperature 0.2. The model name, gemini-3.8-flash, is in llm/adapters/GeminiAdapter.js. It returns: summary, strengths and weaknesses per competitor, caption insights, gaps, hashtag plan, content ideas and prioritized actions.
normalizeReport() checks the LLM's output in code:
It removes any hashtag that didn't appear in real posts.
It drops competitor usernames that weren't in the data.
It drops gaps that come without evidence.
It caps list lengths.
If the JSON is bad or the report is empty, it retries once.



*/