// ─────────────────────────────────────────────────────────────
// orchestrator.js — Orchestrator Agent (skill: orchestrator.md)
// Brand context -> Competitor Research (×N, real API) -> Data Collection -> Post ‖ Comment Analysis
// -> Performance -> Gap -> Opportunity -> Strategy (+1 optional LLM call) -> Ideation -> Brief -> QC
// -> waits for: Customer Approval -> Image / Video -> Publish -> Performance Analysis -> Improvement
// startPipeline() returns at once; the run continues in the background with live progress.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const Product = require("../../models/Product.js");
const CompetitorResearch = require("../../models/CompetitorResearch.js");
const InstagramPost = require("../../models/InstagramPost.js");
const { getProvider } = require("../competitors/index.js");
const { analyzeAccount, compareAccounts, allRealHashtags } = require("../competitors/competitorAnalysis.js");
const { buildPostResearch } = require("../competitors/competitorResearchService.js");
const { generateCompetitorReport } = require("../../ai/competitorResearch/CompetitorReportAgent.js");
const { skillConfig, getSkill, loadSkills } = require("../../ai/competitorIntelligence/skillLoader.js");
const { freshPipeline, AGENTS } = require("./agentRegistry.js");
const { ProgressTracker, liveProgress } = require("./progressTracker.js");
const { getOwnComments, getOwnMediaResults } = require("./instagramData.js");
const { runPostAnalysis } = require("./agents/postAnalysisAgent.js");
const { runCommentAnalysis } = require("./agents/commentAnalysisAgent.js");
const { runPerformance } = require("./agents/performanceAgent.js");
const { runContentGap } = require("./agents/contentGapAgent.js");
const { runOpportunity } = require("./agents/opportunityAgent.js");
const { runStrategy } = require("./agents/strategyAgent.js");
const { fallbackIdeas, mergeIdeas } = require("./agents/ideationAgent.js");
const { runBriefs } = require("./agents/briefAgent.js");
const { runQualityCheck } = require("./agents/qualityAgent.js");
const { runResults } = require("./agents/resultsAgent.js");
const { buildCodeReport } = require("./codeReport.js");

const badRequest = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const cleanUsername = (u) => String(u || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "").toLowerCase();
const yieldLoop = () => new Promise((r) => setImmediate(r));

/** run fn over items with a small concurrency pool */
const pool = async (items, size, fn) => {
    let i = 0;
    const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) { const k = i++; await fn(items[k], k); }
    });
    await Promise.all(workers);
};

/** strip the per-post rows (big) before saving */
const slimPosts = ({ rows, ...rest }) => rest;

// ───────── start ─────────
const startPipeline = async ({ productId, competitors = [], prompt = "", useAI = true, method = "manual", platform = "instagram", userId } = {}) => {
    const provider = getProvider(platform);
    if (provider.id !== "instagram") throw badRequest("The agent pipeline runs on Instagram data.");
    if (!mongoose.isValidObjectId(productId)) throw badRequest("Choose your product (Brand Brain) first.");
    const product = await Product.findById(productId).lean();
    if (!product) throw badRequest("Product not found", 404);
    const max = skillConfig("orchestrator").maxCompetitors || 20;
    const usernames = [...new Set((Array.isArray(competitors) ? competitors : [competitors]).map(cleanUsername).filter(Boolean))];
    if (!usernames.length) throw badRequest("Add at least one competitor.");
    if (usernames.length > max) throw badRequest(`Max ${max} competitors per run.`);

    const effectiveUserId = userId || product.userId;

    const pipeline = freshPipeline();
    pipeline.counters.competitors = usernames.length;
    const doc = await CompetitorResearch.create({
        product: product._id, productName: product.aiProfile?.name || "", platform: provider.id,
        competitors: usernames, prompt: String(prompt || "").slice(0, 2000), status: "running",
        method: method === "discovery" ? "discovery" : "manual", useAI: useAI !== false, pipeline,
    });
    setImmediate(() => runPipeline(doc._id, { product, provider, usernames, prompt: doc.prompt, useAI: doc.useAI, pipeline, userId: effectiveUserId })
        .catch((err) => console.error("[CompetitorIntel] pipeline crashed:", err)));
    return doc.toObject();
};

// ───────── the run ─────────
const runPipeline = async (reportId, { product, provider, usernames, prompt, useAI, pipeline, userId }) => {
    const cfgO = skillConfig("orchestrator");
    const t = new ProgressTracker(reportId, pipeline, { saveEveryMs: cfgO.saveEveryMs || 700 });
    const started = Date.now();
    const brand = product.aiProfile || {};
    const result = { data: null, analysis: null, analysisError: null, intelligence: null };
    const accountOpts = { productId: product._id, userId: userId || product.userId };

    try {
        // 0. Orchestrator
        t.start("orchestrator", `Loaded brand context: ${brand.name || "product"}${brand.category ? ` (${brand.category})` : ""}`);
        t.done("orchestrator", `Planned ${AGENTS.length} agents for ${usernames.length} competitor(s) · AI writing ${useAI ? "on (1 LLM call)" : "off (0 LLM calls)"}`,
            { competitors: usernames.length, useAI, keywords: (brand.keywords || []).length });

        // 1. Competitor Research Agents (one per brand, real Business Discovery API)
        t.start("competitor_research", `Researching ${usernames.length} competitors on Instagram`);
        usernames.forEach((u) => t.child("competitor_research", u, { status: "queued" }));
        const rawAccounts = [], accounts = [], failed = [];
        let finished = 0;
        await pool(usernames, cfgO.researchConcurrency || 3, async (u) => {
            t.child("competitor_research", u, { status: "running", startedAt: new Date().toISOString() });
            try {
                const raw = await provider.fetchAccount(u, accountOpts);
                t.count("apiCalls");
                const a = analyzeAccount(raw);
                rawAccounts.push(raw); accounts.push(a);
                t.count("posts", a.postsAnalyzed);
                t.state.live.accounts.push({ username: a.profile.username, followers: a.profile.followers, engagementRate: a.engagementRate, postsAnalyzed: a.postsAnalyzed, avgEngagement: a.avgEngagement, bestFormat: a.bestFormat, postsPerWeek: a.postsPerWeek, profilePictureUrl: a.profile.profilePictureUrl });
                t.child("competitor_research", u, { status: "done", finishedAt: new Date().toISOString(), followers: a.profile.followers, engagementRate: a.engagementRate, posts: a.postsAnalyzed });
                t.log("competitor_research", `@${u}: ${a.postsAnalyzed} posts · ${a.engagementRate ?? "—"}% ER`);
            } catch (err) {
                failed.push({ username: u, error: err.message, statusCode: err.statusCode });
                t.child("competitor_research", u, { status: "failed", error: err.message });
                t.log("competitor_research", `@${u}: ${err.message}`);
            }
            finished++;
            t.count("competitorsDone");
            t.progress("competitor_research", (finished / usernames.length) * 100, `${finished}/${usernames.length} competitors researched`);
        });
        // keep the user's order
        const order = (u) => usernames.indexOf(u);
        rawAccounts.sort((a, b) => order(a.profile.username) - order(b.profile.username));
        accounts.sort((a, b) => order(a.profile.username) - order(b.profile.username));
        if (!accounts.length) {
            t.fail("competitor_research", new Error(failed.map((f) => `@${f.username}: ${f.error}`).join(" · ")));
            throw badRequest(`No competitor data: ${failed.map((f) => `@${f.username}: ${f.error}`).join(" · ")}`, 502);
        }
        t.done("competitor_research", `${accounts.length} researched${failed.length ? `, ${failed.length} failed` : ""} · ${t.state.counters.posts} posts`, { accounts: accounts.length, failed: failed.length, posts: t.state.counters.posts });

        // 2. Data Collection: your account + comments on your posts
        t.start("data_collection", "Reading your own account");
        const notes = [];
        let me = null, meRaw = null, ownComments = [], ownCommentsNote = null;
        try {
            meRaw = await provider.fetchMine(accountOpts);
            t.count("apiCalls");
            if (meRaw?.recentPosts?.length) me = analyzeAccount(meRaw);
            else notes.push("Your own account has no posts we could read, so the report compares competitors only.");
        } catch (err) {
            notes.push(`Your own account could not be read (${err.message}). The report compares competitors only.`);
        }
        if (meRaw?.recentPosts?.length) {
            t.progress("data_collection", 40, `Reading comments on your posts (@${meRaw.profile?.username})`);
            const cfgD = skillConfig("data_collection");
            const r = await getOwnComments(meRaw.recentPosts, {
                maxPosts: cfgD.maxPostsForComments, perPost: cfgD.commentsPerPost,
                onPost: (n) => { t.count("apiCalls"); t.state.counters.comments = n; t.progress("data_collection", 40 + Math.min(55, n / 4), `${n} comments read`); },
            });
            ownComments = r.comments; ownCommentsNote = r.note;
            if (r.note) notes.push(r.note);
        }
        notes.push(
            "Data = each account's most recent posts (likes + comments) from the official Instagram Graph API, not their full history.",
            "Instagram does not share shares, saves, reach or comment text for other accounts."
        );
        t.done("data_collection", `${me ? `Your account: ${me.postsAnalyzed} posts` : "Your account: not available"} · ${ownComments.length} comments`, { yourPosts: me?.postsAnalyzed || 0, comments: ownComments.length });

        // 3. Post Analysis ‖ Comment Analysis
        t.start("post_analysis", `Tagging ${t.state.counters.posts} posts: themes, formats, hooks, timing`);
        t.start("comment_analysis", "Waiting for tagged posts, reading your comments");
        await yieldLoop();
        const posts = runPostAnalysis({ rawAccounts, brand });
        const meRows = meRaw?.recentPosts?.length ? runPostAnalysis({ rawAccounts: [meRaw], brand }).rows : [];
        t.done("post_analysis", `${posts.totals.posts} posts · ${posts.themes.length} themes · ${posts.outliers.length} viral outliers`,
            { posts: posts.totals.posts, themes: posts.themes.length, outliers: posts.outliers.length, topTheme: posts.themes.find((x) => x.reliable && x.key !== "Other")?.key || null });
        await yieldLoop();
        const audience = runCommentAnalysis({ ownComments, postRows: posts.rows, meRows, ownCommentsNote });
        t.done("comment_analysis", audience.own.available ? `${audience.own.total} comments · ${audience.own.sentimentShare.positive}% positive · ${audience.own.intents.length} intents` : `Competitor conversation rates from ${posts.totals.posts} posts (your comment text not available)`,
            { comments: audience.own.total || 0, positivePct: audience.own.sentimentShare?.positive ?? null, questionLift: audience.competitors.question.lift });

        // 4. Competitor Performance (+ the existing comparison numbers)
        t.start("competitor_performance", "Scoring accounts and finding patterns");
        await yieldLoop();
        const comparison = compareAccounts(accounts, me);
        const performance = runPerformance({ accounts, me, rows: posts.rows, meRows });
        t.done("competitor_performance", `Leader: @${performance.accounts[0]?.username} (${performance.accounts[0]?.score}/100) · ${performance.patterns.length} patterns`,
            { leader: performance.accounts[0]?.username, medianER: performance.medians.engagementRate, patterns: performance.patterns.length });

        // 5. Content Gap
        t.start("content_gap", "Looking for what competitors miss");
        await yieldLoop();
        const { gaps, byType } = runContentGap({ posts, audience, performance, comparison, me, meRows });
        t.done("content_gap", `${gaps.length} gaps found`, { gaps: gaps.length, ...byType });

        // 6. Content Opportunity
        t.start("content_opportunity", "Ranking opportunities for the brand");
        await yieldLoop();
        const opp = runOpportunity({ gaps, posts, brand });
        t.done("content_opportunity", `${opp.opportunities.length} opportunities · top: ${opp.opportunities[0]?.title || "—"}`, { opportunities: opp.opportunities.length, topScore: opp.opportunities[0]?.score ?? null });

        // 7. Content Strategy (code) + 8. Ideation (one LLM call, optional)
        t.start("content_strategy", "Building cadence, format mix, pillars and slots");
        const strategy = runStrategy({ brand, posts, performance, opportunities: opp.opportunities, comparison, audience });
        t.progress("content_strategy", 45, `${strategy.cadence.postsPerWeek} posts/week · ${strategy.pillars.length} pillars`);
        const realTags = allRealHashtags(accounts, me);
        let ideas;
        t.start("content_ideation", useAI ? "Waiting for the strategy writer (1 LLM call)" : "Building ideas from opportunity templates (no LLM)");
        if (useAI) {
            try {
                t.progress("content_strategy", 60, "AI writes positioning, insights and ideas from the computed numbers");
                const rules = [getSkill("content_strategy").llmRules, getSkill("content_ideation").llmRules].filter(Boolean).join("\n");
                result.analysis = await generateCompetitorReport({
                    product: brand, goal: prompt, competitors: accounts, me, comparison, platform: provider.name,
                    intelligence: { opportunities: opp.opportunities, strategy, themes: posts.themes, audience }, extraRules: rules,
                });
                t.count("llmCalls");
                if (result.analysis.usage) t.count("llmTokens", (result.analysis.usage.promptTokens || 0) + (result.analysis.usage.completionTokens || 0));
                if (result.analysis.positioning) { strategy.positioning = result.analysis.positioning; strategy.positioningSource = "ai"; }
                ideas = mergeIdeas({ llmIdeas: result.analysis.contentIdeas, opportunities: opp.opportunities, realTags });
            } catch (err) {
                result.analysisError = err.message;
                t.log("content_strategy", `LLM failed (${err.message}) — using the code strategy`);
            }
        }
        if (!ideas?.length) ideas = fallbackIdeas({ brand, opportunities: opp.opportunities, strategy });
        if (!result.analysis) result.analysis = buildCodeReport({ brand, performance, posts, gaps, opportunities: opp.opportunities, strategy, ideas });
        result.analysis.contentIdeas = ideas;
        t.done("content_strategy", `${strategy.cadence.postsPerWeek}/week · ${strategy.formatMix.map((f) => `${f.format} ${f.pct}%`).join(", ")}`,
            { postsPerWeek: strategy.cadence.postsPerWeek, pillars: strategy.pillars.length, positioning: strategy.positioningSource, llmCalls: useAI && !result.analysisError ? 1 : 0 });
        t.done("content_ideation", `${ideas.length} ideas (${ideas[0]?.source === "ai" ? "AI" : "code templates"})`, { ideas: ideas.length, source: ideas[0]?.source || "code" });

        // 9. Content Brief
        t.start("content_brief", "Writing production briefs");
        await yieldLoop();
        const briefs = runBriefs({ ideas, opportunities: opp.opportunities, strategy, posts, gaps, brand });
        t.done("content_brief", `${briefs.length} briefs`, { briefs: briefs.length });

        // 10. Quality Check
        t.start("quality_check", "Validating briefs");
        await yieldLoop();
        // full usernames + profile names only (a root like "brew" from @brew_one is a normal word, not a brand name)
        const names = accounts.flatMap((a) => [a.profile.username, String(a.profile.username || "").replace(/[._]/g, " "), a.profile.name]);
        const quality = runQualityCheck({ briefs, realTags, competitorNames: names });
        t.done("quality_check", `${quality.passed}/${briefs.length} passed · avg ${quality.avgScore ?? "—"}/100`, { passed: quality.passed, avgScore: quality.avgScore });

        // 11+. human / later steps
        t.wait("customer_approval", "Waiting for you to approve the report");
        t.wait("image_agent", "Runs when you create image / carousel posts from approved ideas");
        t.wait("video_agent", "Runs when you create reel posts from approved ideas");
        t.wait("publish_schedule", "Publish from the Editor at the strategy's slots");
        t.wait("performance_analysis", "Runs after posts from this report are published");
        t.wait("strategy_improvement", "Runs after performance analysis");

        result.data = {
            platform: provider.id, source: provider.source, fetchedAt: new Date().toISOString(),
            accounts, me, comparison, failed, notes,
            postResearch: buildPostResearch(result.analysis, comparison, provider.id),
        };
        result.intelligence = {
            posts: slimPosts(posts), audience, performance, gaps, opportunities: opp.opportunities, fitThemes: opp.fitThemes,
            strategy, ideas, briefs, quality, results: null, version: 1,
        };
        const status = failed.length || result.analysisError ? "partial" : "completed";
        t.end(status);
        await t.flush({
            status, data: result.data, analysis: result.analysis, analysisError: result.analysisError || undefined,
            intelligence: result.intelligence, durationMs: Date.now() - started,
        });
    } catch (err) {
        console.error("[CompetitorIntel] run failed:", err.message);
        t.state.agents.filter((a) => a.status === "running").forEach((a) => t.fail(a.id, err));
        t.end("failed");
        await t.flush({ status: "failed", error: err.message, durationMs: Date.now() - started });
    }
};

// ───────── reads / later steps ─────────
const getProgress = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid report id");
    const live = liveProgress(id);
    if (live && live.status === "running") return { _id: id, status: "running", pipeline: live };
    const doc = await CompetitorResearch.findById(id).select("status pipeline durationMs error updatedAt").lean();
    if (!doc) throw badRequest("Report not found", 404);
    // "running" in the DB but not in this server's memory for 2+ minutes = the server restarted mid-run
    if (doc.status === "running" && Date.now() - new Date(doc.updatedAt).getTime() > 120000) {
        const error = "The server restarted while the agents were running. Start the research again.";
        await CompetitorResearch.updateOne({ _id: id }, { $set: { status: "failed", error } });
        return { ...doc, status: "failed", error };
    }
    return doc;
};

const setAgents = async (id, updates) => {
    const doc = await CompetitorResearch.findById(id).select("pipeline").lean();
    if (!doc?.pipeline?.agents) return;
    const now = new Date().toISOString();
    for (const [agentId, patch] of Object.entries(updates)) {
        const a = doc.pipeline.agents.find((x) => x.id === agentId);
        if (!a) continue;
        if (patch.status === "running" && !a.startedAt) a.startedAt = now;
        if (patch.status === "done") { a.finishedAt = now; a.progress = 100; a.startedAt = a.startedAt || now; a.durationMs = new Date(now) - new Date(a.startedAt); }
        Object.assign(a, patch);
        if (patch.message) doc.pipeline.log = [...(doc.pipeline.log || []), { at: now, agent: agentId, message: patch.message }].slice(-80);
    }
    await CompetitorResearch.updateOne({ _id: id }, { $set: { pipeline: doc.pipeline } });
};

/** after approve / linkPost: move the human + creative agents forward */
const syncAfterApproval = async (id) => {
    const doc = await CompetitorResearch.findById(id).select("approval posts analysis pipeline").lean();
    if (!doc?.pipeline) return;
    const ideas = doc.analysis?.contentIdeas || [];
    const made = (doc.posts || []).map((p) => ideas[p.ideaIndex]?.format || "image");
    const img = made.filter((f) => f !== "reel" && f !== "video").length, vid = made.length - img;
    const ids = (doc.posts || []).map((p) => p.postId);
    const published = ids.length ? await InstagramPost.countDocuments({ _id: { $in: ids }, status: "published" }) : 0;
    await setAgents(id, {
        ...(doc.approval?.status === "approved" && { customer_approval: { status: "done", message: "Report approved" } }),
        ...(img && { image_agent: { status: "done", message: `${img} image/carousel draft(s) created`, metrics: { drafts: img } } }),
        ...(vid && { video_agent: { status: "done", message: `${vid} reel draft(s) created`, metrics: { drafts: vid } } }),
        ...(published && { publish_schedule: { status: "done", message: `${published} post(s) published`, metrics: { published } } }),
        ...(!published && made.length && { publish_schedule: { status: "running", progress: 10, message: "Drafts ready — publish them from the Editor" } }),
    });
};

/** Performance Analysis + Strategy Improvement for posts created from this report */
const analyzeResults = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid report id");
    const doc = await CompetitorResearch.findById(id).lean();
    if (!doc) throw badRequest("Report not found", 404);
    if (!doc.intelligence) throw badRequest("This report was made before the agent pipeline. Run a new research.");
    await setAgents(id, { performance_analysis: { status: "running", progress: 10, message: "Reading results from Instagram" } });
    const ideas = doc.analysis?.contentIdeas || [];
    const posts = await InstagramPost.find({ _id: { $in: (doc.posts || []).map((p) => p.postId) } }).lean();
    const items = [];
    for (const link of doc.posts || []) {
        const post = posts.find((p) => String(p._id) === String(link.postId));
        let result = null;
        if (post?.status === "published" && post.instagram?.mediaId) {
            try { result = await getOwnMediaResults(post.instagram.mediaId, skillConfig("performance_analysis").insightMetrics); } catch (err) { console.error("[CompetitorIntel] results:", err.message); }
        }
        items.push({ ideaIndex: link.ideaIndex, idea: ideas[link.ideaIndex], post, result });
    }
    let followers = doc.data?.me?.profile?.followers || null;
    try { followers = (await getProvider("instagram").fetchMine())?.profile?.followers || followers; } catch { /* keep the stored number */ }
    const results = runResults({ items, strategy: doc.intelligence.strategy, followers });
    await CompetitorResearch.updateOne({ _id: id }, { $set: { "intelligence.results": results } });
    await setAgents(id, {
        performance_analysis: { status: results.summary.measured ? "done" : "waiting", message: results.summary.measured ? `${results.summary.measured} published post(s) measured` : "No published posts from this report yet", metrics: results.summary },
        strategy_improvement: { status: results.summary.measured ? "done" : "waiting", message: results.improvements.length ? `${results.improvements.length} improvement(s)` : "Needs published posts", metrics: { improvements: results.improvements.length } },
        ...(results.summary.published && { publish_schedule: { status: "done", message: `${results.summary.published} post(s) published`, metrics: { published: results.summary.published } } }),
    });
    return CompetitorResearch.findById(id).lean();
};

/** agents + their skill files, for the UI */
const listAgents = () => {
    const { list } = loadSkills();
    return AGENTS.map((a) => {
        const s = list.find((x) => x.file === a.skill);
        return { ...a, skillName: s?.name || a.name, role: s?.role || "", llmRules: s?.llmRules || "", config: s?.config || {}, markdown: s?.markdown || "" };
    });
};

module.exports = { startPipeline, runPipeline, getProgress, syncAfterApproval, analyzeResults, listAgents, cleanUsername };
