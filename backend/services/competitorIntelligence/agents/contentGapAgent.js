// ─────────────────────────────────────────────────────────────
// Content Gap Agent (skill: content-gap.md) — NO LLM
// What competitors under-do (white space) and what YOU are missing. Every gap has evidence.
// ─────────────────────────────────────────────────────────────
const { skillConfig } = require("../../../ai/competitorIntelligence/skillLoader.js");
const { round, clamp } = require("../textUtils.js");

const FORMAT_LABEL = { reel: "Reels", carousel: "Carousels", image: "Photos", video: "Videos", text: "Text posts" };
const x = (v) => (v == null ? "—" : `${round(v, 1)}×`);

const runContentGap = ({ posts, audience, performance, comparison = {}, me = null, meRows = [] } = {}) => {
    const cfg = skillConfig("content_gap");
    const minSample = cfg.minSample || 3, minLift = cfg.minLift || 1.15, under = cfg.underservedShare ?? 0.34;
    const gaps = [];
    const add = (g) => gaps.push({ id: `gap_${gaps.length + 1}`, ...g, score: round(clamp(g.score)) });
    const myShare = (pred) => (meRows.length ? round((meRows.filter(pred).length / meRows.length) * 100) : null);

    // 1. themes: high performance, few competitors (white space) — or competitors do it and you don't
    for (const t of posts.themes || []) {
        if (t.key === "Other" || t.posts < minSample || (t.performanceIndex ?? 0) < minLift) continue;
        const yours = myShare((r) => r.themes.includes(t.key));
        if (t.accountShare <= under) {
            add({ type: "theme", theme: t.key, title: `Under-served theme: ${t.key}`,
                detail: `${t.key} posts perform ${x(t.performanceIndex)} better than a typical post, but only ${t.accounts} of ${posts.totals.accounts} competitors post it.`,
                evidence: `${t.posts} posts · performance index ${t.performanceIndex} · used by ${t.usedBy.slice(0, 4).map((u) => `@${u}`).join(", ")}`,
                lift: t.performanceIndex, saturation: t.accountShare, sample: t.posts, score: (t.performanceIndex - 1) * 60 + (1 - t.accountShare) * 45 });
        } else if (yours === 0) {
            add({ type: "theme", theme: t.key, title: `You don't post ${t.key}`,
                detail: `${t.accounts} competitors post ${t.key} content and it performs ${x(t.performanceIndex)} a typical post. None of your recent posts do.`,
                evidence: `${t.posts} competitor posts · performance index ${t.performanceIndex} · your share 0%`,
                lift: t.performanceIndex, saturation: t.accountShare, sample: t.posts, score: (t.performanceIndex - 1) * 60 + 25 });
        }
    }

    // 2. formats
    for (const f of posts.formats || []) {
        if (f.posts < minSample) continue;
        const yours = myShare((r) => r.format === f.key);
        if ((f.performanceIndex ?? 0) >= minLift && f.share < 25) {
            add({ type: "format", format: f.key, title: `${FORMAT_LABEL[f.key] || f.key} are under-used`,
                detail: `${FORMAT_LABEL[f.key] || f.key} are only ${f.share}% of competitor posts but perform ${x(f.performanceIndex)} a typical post.`,
                evidence: `${f.posts} posts · performance index ${f.performanceIndex} · ${f.commentsPer100Likes ?? "—"} comments / 100 likes`,
                lift: f.performanceIndex, saturation: f.accountShare, sample: f.posts, score: (f.performanceIndex - 1) * 70 + (25 - f.share) * 1.4 + 20 });
        } else if (yours != null && (f.performanceIndex ?? 0) >= 1 && f.share - yours >= 15) {
            add({ type: "format", format: f.key, title: `You post fewer ${FORMAT_LABEL[f.key] || f.key}`,
                detail: `Competitors use ${FORMAT_LABEL[f.key] || f.key} for ${f.share}% of posts (index ${f.performanceIndex}); you use them for ${yours}%.`,
                evidence: `${f.posts} competitor posts vs your ${yours}% share`,
                lift: f.performanceIndex, saturation: f.accountShare, sample: f.posts, score: (f.share - yours) * 0.8 + (f.performanceIndex - 1) * 40 + 15 });
        }
    }

    // 3. conversation (questions in captions)
    const q = audience?.competitors?.question;
    const qShare = (posts.question || []).find((r) => r.key === "With question")?.share ?? 0;
    if (q?.lift >= minLift && q.withQuestion.posts >= minSample && qShare < 35) {
        add({ type: "conversation", title: "Few competitors start conversations",
            detail: `Captions with a question get ${x(q.lift)} more comments per like, yet only ${qShare}% of competitor captions ask one.`,
            evidence: `${q.withQuestion.commentsPer100Likes} vs ${q.withoutQuestion.commentsPer100Likes} comments / 100 likes (${q.withQuestion.posts} vs ${q.withoutQuestion.posts} posts)`,
            lift: q.lift, saturation: qShare / 100, sample: q.withQuestion.posts, score: (q.lift - 1) * 60 + (35 - qShare) + 15 });
    }

    // 4. CTA
    const ctaY = (posts.cta || []).find((r) => r.key === "With CTA"), ctaN = (posts.cta || []).find((r) => r.key === "No CTA");
    if (ctaY && ctaN && ctaY.posts >= minSample && ctaY.performanceIndex && ctaN.performanceIndex && ctaY.performanceIndex / ctaN.performanceIndex >= minLift && ctaY.share < 40) {
        const lift = round(ctaY.performanceIndex / ctaN.performanceIndex, 2);
        add({ type: "cta", title: "Clear calls to action are rare",
            detail: `Posts with a call to action perform ${x(lift)} posts without one, but only ${ctaY.share}% use it.`,
            evidence: `index ${ctaY.performanceIndex} vs ${ctaN.performanceIndex} (${ctaY.posts} vs ${ctaN.posts} posts)`,
            lift, saturation: ctaY.share / 100, sample: ctaY.posts, score: (lift - 1) * 60 + (40 - ctaY.share) * 0.6 + 10 });
    }

    // 5. timing: strong slots with few competitor posts
    const cells = [];
    (posts.heatmap?.cells || []).forEach((row, d) => row.forEach((c, s) => cells.push({ ...c, day: posts.heatmap.days[d], slot: posts.heatmap.slots[s] })));
    const busy = cells.map((c) => c.posts).sort((a, b) => a - b);
    const medBusy = busy[Math.floor(busy.length * 0.75)] || 0;
    const windows = cells.filter((c) => c.posts >= 2 && c.posts <= Math.max(2, medBusy) && (c.performanceIndex ?? 0) >= minLift)
        .sort((a, b) => b.performanceIndex - a.performanceIndex).slice(0, 2);
    windows.forEach((c) => add({ type: "timing", slot: { day: c.day, slot: c.slot }, title: `Low-competition window: ${c.day} ${c.slot}`,
        detail: `Posts at ${c.day} ${c.slot} (${posts.heatmap.timezone}) perform ${x(c.performanceIndex)} a typical post, and few competitors post then.`,
        evidence: `${c.posts} competitor posts in this slot · index ${c.performanceIndex}`,
        lift: c.performanceIndex, saturation: c.posts / Math.max(1, posts.totals.posts), sample: c.posts, score: (c.performanceIndex - 1) * 45 + 15 }));

    // 6. hashtags you don't use
    const tags = (comparison.hashtagGap || []).slice(0, 6);
    if (tags.length >= 2) {
        add({ type: "hashtag", hashtags: tags.map((t) => t.hashtag), title: me ? "Hashtags your competitors share that you don't use" : "Hashtags your competitors share",
            detail: `${tags.length} hashtags are used by several competitors${me ? " and never by you" : ""}.`,
            evidence: tags.map((t) => `${t.hashtag} (${t.competitorsUsing} accounts, ${t.posts} posts)`).join(", "),
            lift: 1, saturation: 0.5, sample: tags.reduce((n, t) => n + t.posts, 0), score: 30 + tags.length * 3 });
    }

    // 7. what your audience asks for
    for (const it of audience?.own?.intents || []) {
        if (!["Purchase intent", "Question", "Request", "Complaint"].includes(it.intent) || it.share < 8 || it.count < 3) continue;
        add({ type: "audience", intent: it.intent, title: `Your audience: ${it.intent.toLowerCase()} (${it.share}% of comments)`,
            detail: it.intent === "Purchase intent" ? "People ask about price, availability or where to buy — content that answers this converts."
                : it.intent === "Complaint" ? "Recurring complaints — address them openly in content (FAQ, process, guarantees)."
                    : it.intent === "Request" ? "People request products/content — show you listen." : "People keep asking questions — answer them in posts.",
            evidence: `${it.count} of ${audience.own.total} comments on your posts${audience.own.questions?.[0] ? ` · e.g. “${audience.own.questions[0]}”` : ""}`,
            lift: 1.2, saturation: 0, sample: it.count, score: 35 + it.share });
    }

    // 8. posting frequency
    const myPpw = performance?.you?.postsPerWeek, theirs = performance?.medians?.postsPerWeek;
    if (myPpw != null && theirs != null && theirs - myPpw >= 1) {
        add({ type: "frequency", title: "You post less often than competitors",
            detail: `Competitors post ${theirs} times a week (median); you post ${myPpw}.`,
            evidence: `median ${theirs}/week vs your ${myPpw}/week`, lift: 1, saturation: 1, sample: posts.totals.posts, score: 20 + (theirs - myPpw) * 8 });
    }

    // 9. hooks
    for (const h of posts.hooks || []) {
        if (h.posts < minSample || (h.performanceIndex ?? 0) < minLift || h.share >= 20 || ["No caption", "Statement"].includes(h.key)) continue;
        add({ type: "hook", hookType: h.key, title: `"${h.key}" hooks work but are rare`,
            detail: `Posts that open with a ${h.key.toLowerCase()} hook perform ${x(h.performanceIndex)} a typical post; only ${h.share}% of posts use one.`,
            evidence: `${h.posts} posts · index ${h.performanceIndex}`, lift: h.performanceIndex, saturation: h.share / 100, sample: h.posts,
            score: (h.performanceIndex - 1) * 55 + (20 - h.share) + 10 });
    }

    const sorted = gaps.sort((a, b) => b.score - a.score).slice(0, cfg.maxGaps || 10);
    return { gaps: sorted, byType: sorted.reduce((m, g) => ({ ...m, [g.type]: (m[g.type] || 0) + 1 }), {}) };
};

module.exports = { runContentGap };
