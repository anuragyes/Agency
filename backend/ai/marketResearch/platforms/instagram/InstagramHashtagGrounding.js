// ─────────────────────────────────────────────────────────────
// InstagramHashtagGrounding.js — keeps the LLM honest about hashtags.
// The prompt ASKS the model to pick only verified hashtags; this code ENFORCES it.
// ─────────────────────────────────────────────────────────────

const toTag = (h) => "#" + String(h || "").replace(/^#+/, "").replace(/\s+/g, "").toLowerCase();

const hasVerifiedHashtags = (hashtagData) => Boolean(hashtagData?.hashtags?.length);

/** Small version of the API data for the prompt (fewer tokens, only what the LLM needs) */
const toPromptHashtagData = (hashtagData) => ({
    fetchedAt: hashtagData.fetchedAt,
    seedHashtags: hashtagData.seeds.map(({ hashtag, found, topPosts, recentPosts24h, avgTopPostEngagement }) => ({
        hashtag, found, topPosts, recentPosts24h, avgTopPostEngagement,
    })),
    verifiedHashtags: hashtagData.hashtags.map(({ hashtag, posts, topPosts, recentPosts24h, avgLikes, avgComments, seenWith }) => ({
        hashtag, posts, topPosts, recentPosts24h, avgLikes, avgComments, usedWith: seenWith,
    })),
});

/** Keep only hashtags that exist in the verified list. Returns { kept, removed } */
const filterToVerified = (list, verifiedSet) => {
    const kept = [];
    let removed = 0;
    for (const h of Array.isArray(list) ? list : []) {
        const tag = toTag(typeof h === "string" ? h : h?.hashtag);
        if (verifiedSet.has(tag) && !kept.includes(tag)) kept.push(tag);
        else if (tag.length > 1) removed++;
    }
    return { kept, removed };
};

/**
 * Standalone agent output: research.hashtagResearch.{primary,niche,related}
 * -> only verified hashtags + attach the real metrics and the data source.
 */
const applyHashtagGrounding = (research, hashtagData) => {
    const hr = research.hashtagResearch || {};
    research.researchLimitations = Array.isArray(research.researchLimitations) ? research.researchLimitations : [];

    if (!hasVerifiedHashtags(hashtagData)) {
        research.hashtagResearch = {
            primary: (hr.primary || []).map(toTag),
            niche: (hr.niche || []).map(toTag),
            related: (hr.related || []).map(toTag),
            source: "ai_suggestion_unverified",
            verified: [],
            seeds: hashtagData?.seeds || [],
            fetchedAt: null,
        };
        research.researchLimitations.unshift(
            "Hashtags are AI suggestions, NOT verified with live Instagram data.",
            ...(hashtagData?.limitations || [])
        );
        return research;
    }

    const bySet = new Map(hashtagData.hashtags.map((h) => [h.hashtag, h]));
    const verifiedSet = new Set(bySet.keys());
    const used = new Set();
    const pick = (list) => {
        const { kept, removed } = filterToVerified(list, verifiedSet);
        const unique = kept.filter((t) => !used.has(t));
        unique.forEach((t) => used.add(t));
        return { tags: unique, removed };
    };

    const primary = pick(hr.primary);
    const niche = pick(hr.niche);
    const related = pick(hr.related);
    const removed = primary.removed + niche.removed + related.removed;

    // LLM gave nothing usable -> fall back to the API ranking
    if (!used.size) {
        const ranked = hashtagData.hashtags.map((h) => h.hashtag);
        primary.tags = ranked.slice(0, 5);
        niche.tags = ranked.slice(5, 15);
        related.tags = ranked.slice(15, 25);
        [...primary.tags, ...niche.tags, ...related.tags].forEach((t) => used.add(t));
        research.researchLimitations.push("Hashtags were ranked by Instagram usage only (AI selection was empty).");
    }

    if (removed) {
        research.researchLimitations.push(`${removed} AI-suggested hashtag(s) removed: not found in live Instagram data.`);
    }

    research.hashtagResearch = {
        primary: primary.tags,
        niche: niche.tags,
        related: related.tags,
        source: "instagram_graph_api",
        verified: [...used].map((t) => bySet.get(t)),
        seeds: hashtagData.seeds,
        mediaAnalyzed: hashtagData.mediaAnalyzed,
        fetchedAt: hashtagData.fetchedAt,
    };
    research.researchLimitations.push(...hashtagData.limitations);
    return research;
};

module.exports = { toTag, hasVerifiedHashtags, toPromptHashtagData, filterToVerified, applyHashtagGrounding };
