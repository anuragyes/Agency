// ─────────────────────────────────────────────────────────────
// instagramAudienceService.js — REAL audience data for the Audience page
//   Instagram API with Instagram Login ("IGAA..." token, graph.instagram.com)
//
//   GET /api/instagram/audience  ->  getInstagramAudience()
//     profile        followers / following / posts                (instagram_business_basic)
//     demographics   age, gender, top countries, top cities       (follower_demographics, needs 100+ followers)
//     online         when followers are online, last ~30 days     (online_followers, needs 100+ followers)
//     activity       reach (followers vs non-followers), accounts engaged, likes, comments,
//                    shares, saves, follows / unfollows, daily reach — last 30 days
//     formats        which formats (Reels, Carousels, Images…) get the most engagement — from your posts
//     posts          timestamp + engagement of recent posts (frontend builds "best time to post")
//     sentiment      positive / neutral / negative share of recent comments (instagram_business_manage_comments)
//
//   Every section is fetched on its own: if Meta refuses one (permission, <100 followers…) the rest still
//   works and the reason goes to `errors.<section>`. Results are cached 10 min (?refresh=1 skips the cache).
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { apiErrorMessage } = require("./instagramService.js");
const { toPostView, computeStats } = require("./instagramInsightsService.js");

const { getAccountCredentials } = require("./tokenService.js");

const IG_GRAPH = "https://graph.instagram.com";
const TIMEOUT = 15000;
const DAY_S = 24 * 60 * 60;
const CACHE_MS = 10 * 60 * 1000;
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

let audienceCache = new Map(); // cacheKey -> { at, data }

const config = async ({ productId, userId } = {}) => {
    let token = null;
    let igUserId = null;
    const creds = await getAccountCredentials({ productId, userId, platform: "instagram" });
    if (creds?.accessToken) {
        token = creds.accessToken;
        igUserId = creds.accountId;
    } else if (!userId) {
        token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
        igUserId = process.env.META_INSTAGRAM_USER_ID || process.env.INSTAGRAM_USER_ID;
    }
    if (!token) throw Object.assign(new Error("No Instagram account connected. Please connect via Meta OAuth in Social Accounts."), { statusCode: 400 });

    const version = process.env.INSTAGRAM_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0";
    const isMeta = token.startsWith("EA") || Boolean(igUserId) || !token.startsWith("IG");
    const host = isMeta ? "https://graph.facebook.com" : IG_GRAPH;
    const target = isMeta && igUserId ? igUserId : "me";
    return { token, base: `${host}/${version}/${target}` };
};

const get = async (url, params) => (await axios.get(url, { params, timeout: TIMEOUT })).data;

/** Try a list of param sets — next one only when Meta says "invalid parameter" (code 100) */
const tryParams = async (url, sets) => {
    let last;
    for (const params of sets) {
        try {
            return await get(url, params);
        } catch (err) {
            last = err;
            if (err.response?.data?.error?.code !== 100) break;
        }
    }
    throw last;
};

const pct = (v, total) => (total ? Math.round((v / total) * 1000) / 10 : 0);

/** Friendly reason for a failed section */
const reason = (err) => {
    const msg = apiErrorMessage(err);
    if (/permission|scope|#10\b|#200\b/i.test(msg)) return `Missing permission: ${msg}`;
    if (/100 followers|not enough|insufficient/i.test(msg)) return "Instagram only shares this for accounts with 100+ followers.";
    return msg;
};

// ───────── sections ─────────

const fetchProfile = ({ token, base }) =>
    tryParams(base, [
        { access_token: token, fields: "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count" },
        { access_token: token, fields: "id,username,name,profile_picture_url,followers_count,follows_count,media_count" },
        { access_token: token, fields: "user_id,username,followers_count" },
    ]);

const fetchPosts = async ({ token, base }, limit) => {
    const data = await tryParams(`${base}/media`, [
        { access_token: token, limit, fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url" },
        { access_token: token, limit, fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count" },
    ]);
    return (data.data || []).map(toPostView);
};

/** follower_demographics with one breakdown -> [{ keys: [...dimension values], value }] */
const fetchDemographic = async ({ token, base }, breakdown) => {
    const common = { access_token: token, metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown };
    const data = await tryParams(`${base}/insights`, [common, { ...common, timeframe: "this_month" }, { ...common, timeframe: "this_week" }]);
    const results = data.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    return results.map((r) => ({ keys: r.dimension_values || [], value: Number(r.value) || 0 }));
};

const buildDemographics = (ageGender, countries, cities) => {
    const out = {};
    if (ageGender) {
        const byAge = new Map();
        const byGender = { F: 0, M: 0, U: 0 };
        for (const { keys: [age, gender], value } of ageGender) {
            byAge.set(age, (byAge.get(age) || 0) + value);
            byGender[gender in byGender ? gender : "U"] += value;
        }
        const total = [...byAge.values()].reduce((a, b) => a + b, 0);
        out.total = total;
        out.ages = [...byAge.entries()]
            .sort((a, b) => AGE_ORDER.indexOf(a[0]) - AGE_ORDER.indexOf(b[0]))
            .map(([label, value]) => ({ label, value, pct: pct(value, total) }));
        out.gender = { women: pct(byGender.F, total), men: pct(byGender.M, total), other: pct(byGender.U, total) };
    }
    const top = (rows, key) => {
        if (!rows) return undefined;
        const total = rows.reduce((a, r) => a + r.value, 0);
        return rows.sort((a, b) => b.value - a.value).slice(0, 10).map((r) => ({ [key]: r.keys[0], value: r.value, pct: pct(r.value, total) }));
    };
    out.countries = top(countries, "code");
    out.cities = top(cities, "name");
    return out;
};

/** online_followers: one row per day, value = { "0": n, …, "23": n } (hours from the start of that day) */
const fetchOnline = async ({ token, base }) => {
    const until = Math.floor(Date.now() / 1000);
    const data = await get(`${base}/insights`, { access_token: token, metric: "online_followers", period: "lifetime", since: until - 29 * DAY_S, until });
    return (data.data?.[0]?.values || [])
        .filter((v) => v.value && typeof v.value === "object" && Object.keys(v.value).length)
        .map((v) => ({ endTime: v.end_time, hours: v.value }));
};

/** Last 30 days: totals (+ breakdowns) and daily reach */
const fetchActivity = async ({ token, base }) => {
    const until = Math.floor(Date.now() / 1000);
    const since = until - 29 * DAY_S;
    const url = `${base}/insights`;
    const q = (extra) => get(url, { access_token: token, period: "day", since, until, ...extra });
    const total = (row) => Number(row?.total_value?.value) || 0;
    const split = (row) => Object.fromEntries((row?.total_value?.breakdowns?.[0]?.results || []).map((r) => [r.dimension_values?.[0], Number(r.value) || 0]));

    const [totals, reach, follows, views, daily] = await Promise.allSettled([
        q({ metric: "accounts_engaged,total_interactions,likes,comments,shares,saves", metric_type: "total_value" }),
        q({ metric: "reach", metric_type: "total_value", breakdown: "follow_type" }),
        q({ metric: "follows_and_unfollows", metric_type: "total_value", breakdown: "follow_type" }),
        q({ metric: "views", metric_type: "total_value" }),
        q({ metric: "reach", metric_type: "time_series" }),
    ]);
    if ([totals, reach, daily].every((r) => r.status === "rejected")) throw totals.reason;

    const out = { since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString(), errors: {} };
    if (totals.status === "fulfilled") {
        for (const row of totals.value.data || []) out[row.name.replace(/_(\w)/g, (_, c) => c.toUpperCase())] = total(row);
    } else out.errors.totals = reason(totals.reason);
    if (reach.status === "fulfilled") {
        const row = reach.value.data?.[0];
        const s = split(row);
        out.reach = total(row);
        out.reachFollowers = s.FOLLOWER ?? null;
        out.reachNonFollowers = s.NON_FOLLOWER ?? null;
    } else out.errors.reach = reason(reach.reason);
    if (follows.status === "fulfilled") {
        const s = split(follows.value.data?.[0]);
        out.follows = s.FOLLOWER ?? null;
        out.unfollows = s.NON_FOLLOWER ?? null; // Meta reports unfollows under NON_FOLLOWER for this metric
    } else out.errors.follows = reason(follows.reason);
    if (views.status === "fulfilled") out.views = total(views.value.data?.[0]);
    if (daily.status === "fulfilled") {
        out.reachDaily = (daily.value.data?.[0]?.values || []).map((v) => ({ date: v.end_time, value: Number(v.value) || 0 }));
    } else out.errors.reachDaily = reason(daily.reason);
    if (!Object.keys(out.errors).length) delete out.errors;
    return out;
};

const FORMAT_LABEL = { REELS: "Reels", CAROUSEL_ALBUM: "Carousels", IMAGE: "Single image", VIDEO: "Video", STORY: "Stories" };
const formatOf = (p) => (p.productType === "REELS" ? "REELS" : p.mediaType || "IMAGE");

/** Average engagement per format, from your real posts */
const buildFormats = (posts, followers) => {
    const map = new Map();
    for (const p of posts) {
        if (p.engagement == null) continue;
        const k = formatOf(p);
        const s = map.get(k) || { key: k, label: FORMAT_LABEL[k] || k, posts: 0, sum: 0 };
        s.posts++;
        s.sum += p.engagement;
        map.set(k, s);
    }
    return [...map.values()]
        .map(({ sum, ...s }) => {
            const avgEngagement = Math.round(sum / s.posts);
            return { ...s, avgEngagement, engagementRate: followers ? Math.round((avgEngagement / followers) * 10000) / 100 : null };
        })
        .sort((a, b) => b.avgEngagement - a.avgEngagement);
};

// ───────── comment sentiment (simple word + emoji lexicon, no AI) ─────────
const POS = /\b(love|loved|loving|lovely|great|amazing|awesome|best|nice|beautiful|good|perfect|wow|cool|fantastic|excellent|superb|congrats|congratulations|thanks|thank|helpful|useful|wonderful|gorgeous|cute|brilliant|inspiring|incredible|yummy|delicious|tasty|fab|fabulous|stunning|happy|recommend|mast|badhiya|badiya|sundar|accha|achha|shandar|zabardast|kamaal)\b/gi;
const NEG = /\b(bad|worst|hate|hated|terrible|awful|poor|fake|scam|ugly|boring|disappointed|disappointing|waste|horrible|useless|sucks|refund|broken|problem|issue|wrong|overpriced|spam|fraud|rude|never again|bekar|bekaar|ghatiya|bakwas|faltu)\b/gi;
const POS_EMOJI = /(❤|😍|🔥|👏|🙌|😊|🥰|💯|👍|✨|😁|😃|💖|💕|🤩|😘|💪|🎉|♥)/gu;
const NEG_EMOJI = /(👎|😡|😠|🤬|😞|😢|💔|🤮|😤|😒|🙄)/gu;
const NEGATION = /\b(not|never|no|isn't|wasn't|don't|didn't)\s+(\w+\s+)?(good|great|nice|happy|useful|worth|recommend|love)\b/gi;

const scoreComment = (text = "") => {
    const t = String(text);
    const negated = (t.match(NEGATION) || []).length;
    const pos = (t.match(POS) || []).length + (t.match(POS_EMOJI) || []).length - negated;
    const neg = (t.match(NEG) || []).length + (t.match(NEG_EMOJI) || []).length + negated;
    return pos > neg ? 1 : neg > pos ? -1 : 0;
};

const fetchSentiment = async ({ token, base }, posts, ownUsername) => {
    const targets = posts.filter((p) => (p.comments || 0) > 0).slice(0, 10);
    if (!targets.length) return { analyzed: 0, postsScanned: 0, positive: 0, neutral: 0, negative: 0, score: null };
    const results = await Promise.allSettled(
        targets.map((p) => tryParams(`${base}/${p.id}/comments`, [
            { access_token: token, fields: "text,username,timestamp", limit: 50 },
            { access_token: token, fields: "text", limit: 50 },
        ]))
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    if (!ok.length) throw results[0].reason;
    const own = String(ownUsername || "").toLowerCase();
    const comments = ok.flatMap((r) => r.value.data || []).filter((c) => c.text && String(c.username || "").toLowerCase() !== own);
    const counts = { 1: 0, 0: 0, [-1]: 0 };
    for (const c of comments) counts[scoreComment(c.text)]++;
    const n = comments.length;
    return {
        analyzed: n,
        postsScanned: ok.length,
        positive: pct(counts[1], n),
        neutral: pct(counts[0], n),
        negative: pct(counts[-1], n),
        // 0–10: 5 = neutral, 10 = all positive
        score: n ? Math.round((5 + ((counts[1] - counts[-1]) / n) * 5) * 10) / 10 : null,
        method: "keyword + emoji lexicon",
    };
};

// ───────── main ─────────
const getInstagramAudience = async ({ refresh = false, mediaLimit = 50, productId, userId } = {}) => {
    const cacheKey = `${userId || "anon"}_${productId || "global"}`;
    if (!refresh && audienceCache.has(cacheKey) && Date.now() - audienceCache.get(cacheKey).at < CACHE_MS) {
        return { ...audienceCache.get(cacheKey).data, cached: true };
    }
    const c = await config({ productId, userId });

    // profile is required — everything else is best effort
    const profile = await fetchProfile(c);
    const followers = Number.isFinite(profile.followers_count) ? profile.followers_count : null;

    const [posts, ageGender, countries, cities, online, activity] = await Promise.allSettled([
        fetchPosts(c, mediaLimit),
        fetchDemographic(c, "age,gender"),
        fetchDemographic(c, "country"),
        fetchDemographic(c, "city"),
        fetchOnline(c),
        fetchActivity(c),
    ]);
    const errors = {};
    const val = (r, name) => {
        if (r.status === "fulfilled") return r.value;
        errors[name] = reason(r.reason);
        console.warn(`[InstagramAudience] ${name}:`, errors[name]);
        return undefined;
    };

    const postList = val(posts, "posts") || [];
    const demo = buildDemographics(val(ageGender, "ageGender"), val(countries, "countries"), val(cities, "cities"));
    const onlineRows = val(online, "online");

    let sentiment;
    try {
        sentiment = await fetchSentiment(c, postList, profile.username);
    } catch (err) {
        errors.sentiment = reason(err);
    }

    const stats = computeStats(postList, followers);
    const data = {
        profile: {
            id: profile.user_id || profile.id,
            username: profile.username,
            name: profile.name || "",
            profilePictureUrl: profile.profile_picture_url || null,
            followers,
            following: Number.isFinite(profile.follows_count) ? profile.follows_count : null,
            mediaCount: Number.isFinite(profile.media_count) ? profile.media_count : null,
        },
        // Meta answers with empty lists (not an error) for accounts under 100 followers
        demographics: demo.ages?.length || demo.countries?.length || demo.cities?.length ? demo : null,
        minFollowersForDemographics: 100,
        online: onlineRows?.length ? onlineRows : null,
        activity: val(activity, "activity") || null,
        formats: buildFormats(postList, followers),
        posts: postList.map((p) => ({ timestamp: p.timestamp, engagement: p.engagement, likes: p.likes, comments: p.comments, format: formatOf(p) })),
        engagementRate: stats.engagementRate,
        avgEngagement: stats.avgEngagement,
        postsPerWeek: stats.postsPerWeek,
        topHashtags: stats.topHashtags.slice(0, 15),
        sentiment: sentiment || null,
        ...(Object.keys(errors).length && { errors }),
        source: "Instagram Graph API (Instagram Login)",
        fetchedAt: new Date().toISOString(),
    };
    audienceCache.set(cacheKey, { at: Date.now(), data });
    return { ...data, cached: false };
};

module.exports = { getInstagramAudience, scoreComment, buildFormats, buildDemographics };
