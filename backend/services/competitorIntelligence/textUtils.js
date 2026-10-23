// textUtils.js — small, dependency-free text helpers for the code agents (no LLM)
const STOPWORDS = new Set(("a an the and or but if then so to of in on at for with from by as is are was were be been being it its this that these those " +
    "i me my we our ours you your yours he she they them their his her him what which who whom when where why how all any both each few more most other some such " +
    "no nor not only own same than too very can will just don should now do does did done have has had having get got am im ive youre dont cant wont " +
    "also here there out up down over under again once about into through during before after above below off very really much many like one two three " +
    "new now day days today time make made us via let lets ur u ya yeah ok okay hai hain ka ki ke ko se bhi aur nahi kya yeh ye wo woh tha thi").split(/\s+/));

const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const mean = (arr) => { const a = arr.filter((v) => v != null && Number.isFinite(v)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const median = (arr) => {
    const a = arr.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const stdev = (arr) => {
    const a = arr.filter((v) => v != null && Number.isFinite(v));
    const m = mean(a);
    return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0;
};
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const stripHashtags = (c) => String(c || "").replace(/#[\p{L}\p{N}_]+/gu, " ");
const captionText = (c) => stripHashtags(c).replace(/\s+/g, " ").trim();
const norm = (s) => ` ${String(s || "").toLowerCase().replace(/\s+/g, " ")} `;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** term match: short plain words need word boundaries ("win" must not match "winter") */
const termMatches = (text, term) => {
    const t = String(term || "").toLowerCase();
    if (!t) return false;
    if (/^[a-z]+$/.test(t.trim()) && t.trim().length <= 5) {
        return new RegExp(`(^|[^\\p{L}])${escapeRe(t.trim())}([^\\p{L}]|$)`, "u").test(text);
    }
    return text.includes(t);
};
const countMatches = (text, terms = []) => terms.reduce((n, t) => n + (termMatches(text, t) ? 1 : 0), 0);

/** first line / sentence of a caption = the hook */
const hookOf = (caption) => {
    const t = stripHashtags(caption).trim();
    if (!t) return "";
    const line = t.split(/\n/).map((s) => s.trim()).find(Boolean) || "";
    const sentence = line.match(/^.{0,140}?[.!?](\s|$)/u)?.[0] || line;
    return sentence.trim().slice(0, 140);
};

const EMOJI_START = /^\p{Extended_Pictographic}/u;
const hookType = (hook) => {
    const h = String(hook || "").trim().toLowerCase();
    if (!h) return "No caption";
    if (/^pov\b/.test(h)) return "POV";
    if (/^\d+|\b\d+\s+(ways|tips|things|reasons|steps|mistakes|ideas|recipes|benefits|secrets)\b/.test(h)) return "Number / list";
    if (/^how\b|how to\b/.test(h)) return "How-to";
    if (h.includes("?")) return "Question";
    if (EMOJI_START.test(h)) return "Emoji opener";
    if (/^(new|introducing|meet|launch|now)\b/.test(h)) return "Announcement";
    return "Statement";
};

const tokens = (text) => String(text || "").toLowerCase()
    .replace(/https?:\/\/\S+/g, " ").replace(/[@#][\p{L}\p{N}_.]+/gu, " ")
    .split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

/** top keywords + two-word phrases from a list of texts */
const keywordsOf = (texts, { top = 20 } = {}) => {
    const words = new Map();
    const phrases = new Map();
    for (const t of texts) {
        const tk = tokens(t);
        new Set(tk).forEach((w) => words.set(w, (words.get(w) || 0) + 1));
        const bi = new Set();
        for (let i = 0; i < tk.length - 1; i++) bi.add(`${tk[i]} ${tk[i + 1]}`);
        bi.forEach((p) => phrases.set(p, (phrases.get(p) || 0) + 1));
    }
    const sort = (m, min) => [...m.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, top).map(([term, count]) => ({ term, count }));
    return { keywords: sort(words, 2), phrases: sort(phrases, 2) };
};

const jaccard = (a, b) => {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size && !B.size) return 0;
    let inter = 0;
    A.forEach((w) => { if (B.has(w)) inter++; });
    return inter / (A.size + B.size - inter);
};

const mentionsOf = (text) => [...new Set((String(text || "").match(/@([a-z0-9._]{2,30})/gi) || []).map((m) => m.slice(1).toLowerCase().replace(/\.+$/, "")))];

/** brand context -> lowercase text used for brand-fit scoring */
const brandText = (p = {}) => [p.name, p.category, p.description, p.positioning, ...(p.keywords || []), ...(p.benefits || []), ...(p.uses || []), ...(p.features || []), ...(p.targetAudience || [])]
    .filter(Boolean).join(" ").toLowerCase();

module.exports = { STOPWORDS, round, mean, median, stdev, clamp, captionText, stripHashtags, norm, termMatches, countMatches, hookOf, hookType, tokens, keywordsOf, jaccard, mentionsOf, brandText };
