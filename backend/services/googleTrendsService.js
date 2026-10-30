const googleTrends = require("google-trends-api");

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map();

const parse = (raw) => typeof raw === "string" ? JSON.parse(raw) : raw;
const cleanTerms = (terms) => [...new Set((Array.isArray(terms) ? terms : [])
    .map((term) => String(term || "").trim().replace(/\s+/g, " ").slice(0, 80))
    .filter((term) => term.length >= 2))].slice(0, 5);

const growthPct = (values) => {
    if (values.length < 8) return null;
    const prev = values.slice(-8, -4).reduce((a, b) => a + b, 0) / 4;
    const recent = values.slice(-4).reduce((a, b) => a + b, 0) / 4;
    return prev ? Math.round(((recent - prev) / prev) * 100) : null;
};

async function getProjectTrends({ terms, geo = "" } = {}) {
    const keywords = cleanTerms(terms);
    if (!keywords.length) return { source: "Google Trends", geo, terms: [], fetchedAt: new Date().toISOString() };
    const safeGeo = /^[A-Z]{2}$/.test(String(geo).toUpperCase()) ? String(geo).toUpperCase() : "";
    const key = `${safeGeo}|${keywords.map((x) => x.toLowerCase()).join("|")}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 365 * 24 * 60 * 60 * 1000);
    const results = await Promise.all(keywords.map(async (keyword) => {
        const raw = await googleTrends.interestOverTime({ keyword, startTime, endTime, geo: safeGeo, granularTimeResolution: true });
        const rows = parse(raw)?.default?.timelineData || [];
        const points = rows.map((row) => ({ date: row.formattedTime || row.time, value: Number(row.value?.[0] ?? row.value) || 0 }));
        const values = points.map((point) => point.value);
        return {
            name: keyword,
            cat: "Project research",
            spark: values.slice(-12),
            interest: values.length ? values[values.length - 1] : 0,
            growth: growthPct(values),
            points,
        };
    }));
    results.sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity));
    const data = { source: "Google Trends", geo: safeGeo || "Worldwide", terms: results, fetchedAt: new Date().toISOString(), note: "Search interest is indexed from 0 to 100; it is not absolute search volume." };
    cache.set(key, { at: Date.now(), data });
    return data;
}

module.exports = { getProjectTrends, cleanTerms, growthPct };
