// ─────────────────────────────────────────────────────────────
// discoveryService.js — Competitor Discovery Agent (Method 2, skill: competitor-discovery.md)
// Candidates: hashtag top posts (@mentions) + mentions in known competitors' captions + optional 1 LLM call.
// EVERY candidate is verified with the Business Discovery API and scored in code. Nothing unverified is returned.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const Product = require("../../models/Product.js");
const { getCompetitorAccount } = require("../instagramInsightsService.js");
const { getHashtagId, getHashtagMedia, isHashtagApiConfigured, apiErrorMessage } = require("../instagramService.js");
const { buildSeedHashtags, quotaInfo } = require("../instagramHashtagResearchService.js");
const LLMFactory = require("../../llm/factory/LLMFactory");
const { getSkill } = require("../../ai/competitorIntelligence/skillLoader.js");
const { round, clamp, mentionsOf, tokens } = require("./textUtils.js");

const badRequest = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const DAY = 86400000;
const BLOCK = new Set(["instagram", "reels", "explore", "meta", "facebook", "youtube", "threads", "p", "reel", "stories"]);

const parseJson = (text) => {
    if (text && typeof text === "object") return text;
    const t = String(text || "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
    try { return JSON.parse(t); } catch { /* outer object */ }
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    return s !== -1 && e > s ? JSON.parse(t.slice(s, e + 1)) : {};
};

/** brand words for relevance: keywords, category parts, description words */
const brandWords = (brand, extraText = "") => {
    const extraTokens = extraText ? tokens(extraText) : [];
    const phrases = [...(brand.keywords || []), ...String(brand.category || "").split(/[>\/,&|]+/), ...extraTokens]
        .map((s) => String(s || "").trim().toLowerCase())
        .filter((s) => s.length >= 3);
    const words = new Set([...phrases.flatMap((p) => tokens(p)), ...tokens(brand.description || "").slice(0, 30), ...extraTokens]);
    return { phrases, words };
};

const scoreCandidate = (acc, { brand, bw, seedTags = [], sources = [], weights = {}, isPromptMatch = false, searchPrompt = "" }) => {
    const text = `${acc.profile.biography || ""} ${acc.profile.name || ""} ${(acc.recentPosts || []).map((p) => p.caption || "").join(" ")}`.toLowerCase();
    const tk = new Set(tokens(text));
    const phraseHits = bw.phrases.filter((p) => text.includes(p));
    const wordHits = [...bw.words].filter((w) => tk.has(w));
    const keywordFit = clamp((phraseHits.length * 25 + wordHits.length * 8));
    const tags = new Set((acc.recentPosts || []).flatMap((p) => p.hashtags || []).map((h) => h.toLowerCase().replace(/^#/, "")));
    const tagHits = seedTags.filter((s) => tags.has(s));
    const hashtagFit = clamp(tagHits.length * 40 + [...tags].filter((t) => bw.phrases.some((p) => t.includes(p.replace(/\s+/g, "")))).length * 10);
    const last = Math.max(0, ...(acc.recentPosts || []).map((p) => new Date(p.timestamp).getTime() || 0));
    const activity = last ? clamp(100 - ((Date.now() - last) / DAY) * 2) : 0;
    const f = acc.profile.followers || 0;
    const size = f >= 1000 && f <= 5e6 ? 100 : f > 5e6 ? 75 : f >= 200 ? 50 : 25;
    const multiSource = clamp((sources.length - 1) * 100);
    const parts = { keywordFit, hashtagFit, activity, size, multiSource };
    let sum = 0, ws = 0;
    Object.entries(weights).forEach(([k, v]) => { sum += (parts[k] || 0) * v; ws += v; });
    
    let baseScore = round(ws ? sum / ws : 0);
    if (isPromptMatch) {
        baseScore = Math.max(baseScore, 65 + Math.min(30, (phraseHits.length + wordHits.length) * 5));
    }

    const reasons = [
        searchPrompt ? `Matches request: "${searchPrompt.slice(0, 40)}"` : null,
        phraseHits.length || wordHits.length ? `Bio/posts mention ${[...new Set([...phraseHits, ...wordHits])].slice(0, 4).join(", ")}` : null,
        tagHits.length ? `Uses ${tagHits.slice(0, 3).map((t) => `#${t}`).join(" ")}` : null,
        f ? `${(f >= 1000 ? `${(f / 1000).toFixed(1)}k` : f)} followers` : null,
        last ? `Active ${Math.round((Date.now() - last) / DAY)}d ago` : null,
        `Found via ${sources.join(" + ")}`,
    ].filter(Boolean);
    return { score: baseScore, parts, reasons };
};

/**
 * @param {Object} args
 * @param {string} args.productId
 * @param {string} [args.prompt]      custom user search query (e.g. "popular protein supplement brands")
 * @param {string} [args.userPrompt]  alias for prompt
 * @param {string[]} [args.seeds]     extra keywords / hashtags
 * @param {string[]} [args.known]     competitors already chosen
 * @param {boolean} [args.useAI=true] 1 LLM call for candidate usernames
 * @param {number} [args.limit=15]    number of competitors to return
 */
const discoverCompetitors = async ({ productId, prompt = "", userPrompt = "", seeds = [], known = [], useAI = true, limit = 15 } = {}) => {
    if (!mongoose.isValidObjectId(productId)) throw badRequest("Choose your product (Brand Brain) first.");
    const product = await Product.findById(productId).lean();
    if (!product) throw badRequest("Product not found", 404);
    const brand = product.aiProfile || {};
    const skill = getSkill("competitor_discovery");
    const cfg = skill.config || {};
    const started = Date.now();
    const steps = [];
    const notes = [];
    const candidates = new Map(); // username -> Set(source)
    const add = (u, source) => {
        const k = String(u || "").toLowerCase().replace(/^@/, "").replace(/\.+$/, "").trim();
        if (!/^[a-z0-9._]{2,30}$/.test(k) || BLOCK.has(k)) return;
        const s = candidates.get(k) || new Set();
        s.add(source);
        candidates.set(k, s);
    };
    const knownSet = new Set(known.map((u) => String(u).replace(/^@/, "").toLowerCase()));
    const searchPrompt = String(prompt || userPrompt || "").trim();

    // 1. AI candidates generation (Primary & fastest driver for discovery)
    let llmCalls = 0;
    if (useAI) {
        try {
            const llm = LLMFactory.create();
            const systemInstruction =
                "You are an elite Instagram intelligence agent and brand discovery specialist. " +
                "Suggest 25 to 30 real, active, verified public Instagram business or creator usernames for the requested niche or competitor prompt. " +
                "Focus on official, exact Instagram handles (e.g. for Indian protein brands: muscleblaze, myproteinin, ozivanutrition, asitisnutrition, fastandup_india, optimumnutrition_in, etc.). " +
                "Return JSON strictly in this format: {\"usernames\": [\"username1\", \"username2\", ...]}. " +
                "Do NOT include '@' symbol. Only suggest real brand or creator handles that actually exist on Instagram.";

            let input;
            if (searchPrompt) {
                input = `User Target Prompt: "${searchPrompt}"\n` +
                        `Suggest 25 to 30 real, official Instagram usernames strictly matching the user prompt. Return valid JSON only: {"usernames": [...]}`;
            } else {
                input = `<brand>${JSON.stringify({
                    name: brand.name,
                    category: brand.category,
                    description: String(brand.description || "").slice(0, 400),
                    keywords: (brand.keywords || []).slice(0, 10),
                    targetAudience: (brand.targetAudience || []).slice(0, 4),
                    price: brand.price,
                    positioning: brand.positioning
                })}</brand>\nSuggest 20 to 25 real Instagram usernames of competing brands. Return valid JSON only: {"usernames": [...]}`;
            }

            const text = await llm.generate({
                systemInstruction,
                input,
                temperature: 0.2,
                responseSchema: { type: "object" }
            });
            llmCalls = 1;
            const parsed = parseJson(text);
            const list = (parsed.usernames || []).slice(0, 35);
            list.forEach((u) => add(u, searchPrompt ? "AI prompt match" : "AI suggestion"));
            steps.push({ source: "ai", found: list.length });
        } catch (err) {
            console.error("[CompetitorDiscovery] AI candidate error:", err.message);
            steps.push({ source: "ai", found: 0, note: err.message });
        }
    }

    // 2. Hashtags from brand context / seeds (only run if no prompt is given or when explicitly requested)
    const seedTags = buildSeedHashtags(product, seeds, cfg.maxSeeds || 3);
    if (!searchPrompt && isHashtagApiConfigured() && seedTags.length) {
        for (const tag of seedTags) {
            try {
                const { hashtagId } = await getHashtagId(tag);
                if (!hashtagId) { steps.push({ source: "hashtag", tag: `#${tag}`, found: 0, note: "hashtag not found" }); continue; }
                const media = await getHashtagMedia(hashtagId, "top_media");
                let found = 0;
                media.forEach((m) => mentionsOf(m.caption).forEach((u) => { add(u, `#${tag}`); found++; }));
                steps.push({ source: "hashtag", tag: `#${tag}`, posts: media.length, found });
            } catch (err) {
                steps.push({ source: "hashtag", tag: `#${tag}`, found: 0, note: apiErrorMessage(err) });
                if (err.code === "HASHTAG_WEEKLY_LIMIT") { notes.push(err.message); break; }
            }
        }
    } else if (!searchPrompt) {
        notes.push("Hashtag search not configured or no brand keywords — skipped hashtag discovery.");
    }

    // 3. Mentions in the captions of competitors you already picked
    for (const u of [...knownSet].slice(0, 5)) {
        try {
            const acc = await getCompetitorAccount(u, { mediaLimit: 12 });
            let found = 0;
            acc.recentPosts.forEach((p) => mentionsOf(p.caption).forEach((m) => { add(m, `@${u} mentions`); found++; }));
            steps.push({ source: "mentions", of: `@${u}`, found });
        } catch (err) {
            steps.push({ source: "mentions", of: `@${u}`, found: 0, note: err.message });
        }
    }

    // 4. Verify with Business Discovery API + score
    knownSet.forEach((k) => candidates.delete(k));
    const myUsername = String(process.env.INSTAGRAM_USERNAME || "").toLowerCase();
    if (myUsername) candidates.delete(myUsername);

    const maxToCheck = Math.max(limit + 10, 26);
    const ordered = [...candidates.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, maxToCheck);
    const bw = brandWords(brand, searchPrompt);
    const verified = [], rejected = [];
    let i = 0;
    const concurrency = 4;

    await Promise.all(Array.from({ length: concurrency }, async () => {
        while (i < ordered.length) {
            const [u, src] = ordered[i++];
            try {
                const acc = await getCompetitorAccount(u, { mediaLimit: cfg.mediaLimit || 6 });
                const sources = [...src];
                const isPromptMatch = sources.some((x) => x.includes("AI"));
                const s = scoreCandidate(acc, { brand, bw, seedTags, sources, weights: cfg.weights || {}, isPromptMatch, searchPrompt });
                verified.push({
                    username: acc.profile.username,
                    name: acc.profile.name,
                    profilePictureUrl: acc.profile.profilePictureUrl,
                    biography: acc.profile.biography,
                    website: acc.profile.website,
                    followers: acc.profile.followers,
                    mediaCount: acc.profile.mediaCount,
                    engagementRate: acc.stats.engagementRate,
                    postsPerWeek: acc.stats.postsPerWeek,
                    recentPosts: acc.recentPosts.slice(0, 3).map(({ id, imageUrl, permalink, likes, comments, mediaType }) => ({ id, imageUrl, permalink, likes, comments, mediaType })),
                    sources,
                    relevance: s.score,
                    relevanceParts: s.parts,
                    reasons: s.reasons,
                    verified: true,
                });
            } catch (err) {
                rejected.push({ username: u, sources: [...src], reason: err.message });
            }
        }
    }));

    const results = verified
        .filter((v) => v.username !== myUsername)
        .sort((a, b) => b.relevance - a.relevance || (b.followers || 0) - (a.followers || 0))
        .slice(0, Math.min(30, limit));

    return {
        brand: { name: brand.name, category: brand.category, keywords: (brand.keywords || []).slice(0, 8) },
        prompt: searchPrompt,
        seeds: seedTags.map((t) => `#${t}`),
        candidates: results,
        rejected: rejected.slice(0, 20),
        stats: { candidatesFound: candidates.size, checked: ordered.length, verified: verified.length, shown: results.length, llmCalls, durationMs: Date.now() - started },
        steps,
        notes: [...notes, "Every account shown was verified with the Instagram Business Discovery API. Personal / private accounts can't be analysed and are left out."],
        quota: await quotaInfo().catch(() => null),
    };
};

module.exports = { discoverCompetitors, scoreCandidate, brandWords };
