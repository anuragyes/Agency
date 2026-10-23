// ─────────────────────────────────────────────────────────────
// competitorResearchService.js — runs one competitor research report
//   1. REAL data: each competitor (Business Discovery) + your own account (Graph API)
//   2. exact numbers + gaps in code (competitorAnalysis.js)
//   3. LLM writes the report from those numbers only (CompetitorReportAgent.js)
//   4. saved as a draft -> user approves -> approved ideas become posts (Studio pipeline)
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const Product = require("../../models/Product.js");
const CompetitorResearch = require("../../models/CompetitorResearch.js");
const { getProvider } = require("./index.js");
const { analyzeAccount, compareAccounts } = require("./competitorAnalysis.js");
const { generateCompetitorReport } = require("../../ai/competitorResearch/CompetitorReportAgent.js");
const { apiErrorMessage } = require("../instagramService.js");

const MAX_COMPETITORS = 20; // Business Discovery = 1 API call per competitor
const badRequest = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const cleanUsername = (u) => String(u || "").trim().replace(/^@/, "").toLowerCase();

/** Real hashtags for the post writer (same shape as the Studio's Instagram research) */
const buildPostResearch = (analysis, comparison, platform) => {
    const byTag = new Map([...comparison.sharedHashtags, ...comparison.hashtagGap].map((h) => [h.hashtag, h]));
    const order = [...(analysis?.hashtagPlan?.use || []), ...comparison.sharedHashtags.map((h) => h.hashtag), ...comparison.hashtagGap.map((h) => h.hashtag)];
    const hashtags = [...new Set(order)].slice(0, 30).map((t) => ({
        hashtag: t, posts: byTag.get(t)?.posts ?? null, topPosts: 0, recentPosts24h: 0,
        avgLikes: null, avgComments: null, avgEngagement: byTag.get(t)?.avgEngagement ?? null,
    }));
    return {
        mode: "competitor",
        platform,
        source: "competitor_research",
        status: hashtags.length ? "success" : "unavailable",
        fetchedAt: new Date().toISOString(),
        seeds: [],
        hashtags,
        limitations: ["Hashtags come from your competitors' real posts."],
    };
};

const runCompetitorResearch = async ({ productId, platform = "instagram", competitors = [], prompt = "" } = {}) => {
    const provider = getProvider(platform);
    if (!mongoose.isValidObjectId(productId)) throw badRequest("Choose your product (Brand Brain) first.");
    const product = await Product.findById(productId).lean();
    if (!product) throw badRequest("Product not found", 404);

    const usernames = [...new Set((Array.isArray(competitors) ? competitors : [competitors]).map(cleanUsername).filter(Boolean))];
    if (!usernames.length) throw badRequest("Add at least one competitor.");
    if (usernames.length > MAX_COMPETITORS) throw badRequest(`Max ${MAX_COMPETITORS} competitors per report.`);

    const started = Date.now();
    const doc = await CompetitorResearch.create({
        product: product._id, productName: product.aiProfile?.name || "", platform: provider.id,
        competitors: usernames, prompt: String(prompt || "").slice(0, 2000), status: "running",
    });

    try {
        // 1. real data — one by one (gentle on rate limits)
        const accounts = [];
        const failed = [];
        for (const u of usernames) {
            try {
                accounts.push(analyzeAccount(await provider.fetchAccount(u)));
            } catch (err) {
                failed.push({ username: u, error: err.message || apiErrorMessage(err), statusCode: err.statusCode });
            }
        }
        if (!accounts.length) {
            // every lookup failed for the same reason (e.g. Facebook app review) -> pass the real status through
            const codes = [...new Set(failed.map((f) => f.statusCode).filter(Boolean))];
            throw badRequest(`No competitor data: ${failed.map((f) => `@${f.username}: ${f.error}`).join(" · ")}`, codes.length === 1 && codes[0] === 403 ? 403 : 502);
        }

        const notes = [];
        let me = null;
        try {
            const mine = await provider.fetchMine();
            if (mine?.recentPosts?.length) me = analyzeAccount(mine);
            else notes.push("Your own account has no posts we could read, so the report compares competitors only.");
        } catch (err) {
            notes.push(`Your own account could not be read (${err.message}). The report compares competitors only.`);
        }
        notes.push(
            "Data = each account's most recent posts (likes + comments) from the official API, not their full history.",
            provider.dataNote || "Instagram does not share shares, saves or reach for other accounts."
        );

        // 2. numbers + gaps (code)
        const comparison = compareAccounts(accounts, me);

        // 3. written analysis (LLM, grounded). The report is still useful if this fails.
        let analysis = null;
        let analysisError = null;
        try {
            analysis = await generateCompetitorReport({ product: product.aiProfile || {}, goal: prompt, competitors: accounts, me, comparison, platform: provider.name });
        } catch (err) {
            analysisError = err.message;
            console.error("[CompetitorResearch] AI analysis failed:", err.message);
        }

        doc.data = {
            platform: provider.id, source: provider.source, fetchedAt: new Date().toISOString(),
            accounts, me, comparison, failed, notes,
            postResearch: buildPostResearch(analysis, comparison, provider.id),
        };
        doc.analysis = analysis;
        doc.analysisError = analysisError || undefined;
        doc.status = analysis && !failed.length ? "completed" : "partial";
    } catch (err) {
        doc.status = "failed";
        doc.error = err.message;
        doc.durationMs = Date.now() - started;
        await doc.save();
        throw err;
    }
    doc.durationMs = Date.now() - started;
    await doc.save();
    return doc.toObject();
};

const listForProduct = (productId) => {
    if (!mongoose.isValidObjectId(productId)) throw badRequest("Invalid productId");
    return CompetitorResearch.find({ product: productId })
        .select("productName platform competitors status approval posts createdAt durationMs method useAI")
        .sort({ createdAt: -1 }).limit(20).lean();
};

const getById = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid report id");
    const doc = await CompetitorResearch.findById(id).lean();
    if (!doc) throw badRequest("Report not found", 404);
    return doc;
};

const approve = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid report id");
    const doc = await CompetitorResearch.findById(id);
    if (!doc) throw badRequest("Report not found", 404);
    if (!doc.data) throw badRequest("This report has no data to approve.");
    doc.approval = { status: "approved", approvedAt: new Date() };
    await doc.save();
    return doc.toObject();
};

const linkPost = async (id, { ideaIndex, postId }) => {
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(postId)) throw badRequest("Invalid id");
    const doc = await CompetitorResearch.findById(id);
    if (!doc) throw badRequest("Report not found", 404);
    if (doc.approval?.status !== "approved") throw badRequest("Approve the report before creating posts.");
    doc.posts.push({ ideaIndex: Number(ideaIndex), postId, createdAt: new Date() });
    await doc.save();
    return doc.toObject();
};

module.exports = { runCompetitorResearch, listForProduct, getById, approve, linkPost, buildPostResearch, MAX_COMPETITORS };
