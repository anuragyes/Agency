// ─────────────────────────────────────────────────────────────
// Comment Analysis Agent (skill: comment-analysis.md) — NO LLM
//   ownComments : real comment text on YOUR posts (Graph API)        -> sentiment, intents, keywords, questions
//   postRows    : every competitor post (likes + comments counts)    -> conversation rate per account / format / theme
// Meta does not share comment TEXT of other brands' posts — we never pretend it does.
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, mean, norm, countMatches, keywordsOf } = require("../textUtils.js");

const cleanSample = (t) => String(t || "").replace(/@[\w.]+/g, "@…").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 180);

const classifyComment = (text, cfg) => {
    const t = norm(text);
    const pos = countMatches(t, cfg.positive || []);
    const neg = countMatches(t, cfg.negative || []);
    const sentiment = pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
    const intents = Object.entries(cfg.intents || {})
        .filter(([name, terms]) => (name === "Tag a friend" ? /^\s*(@[\w.]+\s*)+$/.test(String(text || "")) || (/@[\w.]+/.test(text) && t.trim().length < 40) : countMatches(t, terms) > 0))
        .map(([name]) => name);
    return { sentiment, intents };
};

const analyzeOwnComments = (comments = [], cfg) => {
    if (!comments.length) return { available: false, total: 0 };
    const seen = new Set();
    const list = comments.filter((c) => {
        const k = `${c.username || ""}|${c.text}`;
        if (!c.text || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const intentCount = new Map();
    const questions = [];
    for (const c of list) {
        const r = classifyComment(c.text, cfg);
        sentiment[r.sentiment]++;
        r.intents.forEach((i) => intentCount.set(i, (intentCount.get(i) || 0) + 1));
        if (r.intents.includes("Question") || r.intents.includes("Purchase intent")) {
            const s = cleanSample(c.text);
            if (s.length >= 6 && !questions.includes(s)) questions.push(s);
        }
    }
    const total = list.length;
    const { keywords, phrases } = keywordsOf(list.map((c) => c.text), { top: 18 });
    return {
        available: true,
        total,
        postsRead: new Set(list.map((c) => c.mediaId)).size,
        sentiment,
        sentimentShare: Object.fromEntries(Object.entries(sentiment).map(([k, v]) => [k, round((v / Math.max(1, total)) * 100)])),
        netSentiment: round(((sentiment.positive - sentiment.negative) / Math.max(1, total)) * 100),
        intents: [...intentCount.entries()].map(([intent, count]) => ({ intent, count, share: round((count / Math.max(1, total)) * 100) })).sort((a, b) => b.count - a.count),
        keywords, phrases,
        questions: questions.slice(0, cfg.maxQuestions || 8),
    };
};

const conversationOf = (rows) => {
    const likes = rows.reduce((n, r) => n + (r.likes || 0), 0);
    const comments = rows.reduce((n, r) => n + (r.comments || 0), 0);
    return { posts: rows.length, likes, comments, avgComments: round(comments / Math.max(1, rows.length), 1), commentsPer100Likes: likes ? round((comments / likes) * 100, 2) : null };
};

const runCommentAnalysis = ({ ownComments = [], postRows = [], meRows = [], ownCommentsNote = null } = {}) => {
    const cfg = skillConfig("comment_analysis");
    const own = analyzeOwnComments(ownComments, cfg);
    if (!own.available && ownCommentsNote) own.note = ownCommentsNote;

    const byAccount = [...new Set(postRows.map((r) => r.username))].map((u) => ({ username: u, ...conversationOf(postRows.filter((r) => r.username === u)) }))
        .sort((a, b) => (b.commentsPer100Likes ?? -1) - (a.commentsPer100Likes ?? -1));
    const byFormat = [...new Set(postRows.map((r) => r.format))].map((f) => ({ format: f, ...conversationOf(postRows.filter((r) => r.format === f)) }));

    const withQ = conversationOf(postRows.filter((r) => r.hasQuestion));
    const withoutQ = conversationOf(postRows.filter((r) => !r.hasQuestion));
    const questionLift = withQ.commentsPer100Likes && withoutQ.commentsPer100Likes ? round(withQ.commentsPer100Likes / withoutQ.commentsPer100Likes, 2) : null;

    const topConversation = [...postRows].filter((r) => r.comments != null).sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 5)
        .map(({ id, username, format, hook, likes, comments, permalink, imageUrl, themes }) => ({ id, username, format, hook, likes, comments, permalink, imageUrl, themes }));

    return {
        own,
        competitors: {
            byAccount, byFormat, topConversation,
            question: { withQuestion: withQ, withoutQuestion: withoutQ, lift: questionLift },
            avgCommentsPer100Likes: round(mean(byAccount.map((a) => a.commentsPer100Likes)), 2),
        },
        you: meRows.length ? conversationOf(meRows) : null,
        limitations: ["Meta does not share the text of comments on other brands' posts — competitor audiences are measured by comment counts and comment-to-like ratios."],
    };
};

module.exports = { runCommentAnalysis, classifyComment, analyzeOwnComments };
