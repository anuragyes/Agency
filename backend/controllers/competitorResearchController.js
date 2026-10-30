// competitorResearchController.js — /api/competitor-research (routes/competitorResearchRoutes.js)
const { getProvider, listPlatforms } = require("../services/competitors");
const svc = require("../services/competitors/competitorResearchService.js");
const intel = require("../services/competitorIntelligence/orchestrator.js");
const { discoverCompetitors } = require("../services/competitorIntelligence/discoveryService.js");

const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (err) { next(err); }
};

module.exports = {
    // GET /platforms
    platforms: (req, res) => res.json({ success: true, data: listPlatforms(), maxCompetitors: svc.MAX_COMPETITORS }),

    // GET /:platform/lookup?username=amul_india  -> one real profile card
    lookup: wrap(async (req, res) => {
        const provider = getProvider(req.params.platform);
        const username = req.params.platform === "instagram" ? intel.cleanUsername(req.query.username) : String(req.query.username || "").trim();
        res.json({
            success: true,
            data: await provider.lookup(username, {
                productId: req.query.productId,
                userId: req.user?._id,
            }),
        });
    }),

    // POST /  { productId, platform, competitors: ["amul_india"], prompt }
    run: wrap(async (req, res) => {
        const { productId, platform, competitors, prompt } = req.body || {};
        res.status(201).json({ success: true, data: await svc.runCompetitorResearch({ productId, platform, competitors, prompt, userId: req.user?._id }) });
    }),

    // GET /product/:productId  -> history
    list: wrap(async (req, res) => res.json({ success: true, data: await svc.listForProduct(req.params.productId) })),

    // GET /:id
    get: wrap(async (req, res) => res.json({ success: true, data: await svc.getById(req.params.id) })),

    // POST /:id/approve
    approve: wrap(async (req, res) => {
        await svc.approve(req.params.id);
        await intel.syncAfterApproval(req.params.id).catch((e) => console.error("[CompetitorIntel] sync:", e.message));
        res.json({ success: true, data: await svc.getById(req.params.id) });
    }),

    // POST /:id/posts  { ideaIndex, postId }  (post created by the Studio pipeline from an approved idea)
    linkPost: wrap(async (req, res) => {
        await svc.linkPost(req.params.id, req.body || {});
        await intel.syncAfterApproval(req.params.id).catch((e) => console.error("[CompetitorIntel] sync:", e.message));
        res.json({ success: true, data: await svc.getById(req.params.id) });
    }),

    // ───── AI Competitor Intelligence & Content Strategy Agent (multi-agent pipeline) ─────
    // GET /agents -> every agent + its skill file (instructions + config)
    agents: (req, res) => res.json({ success: true, data: intel.listAgents() }),

    // POST /discover { productId, seeds?, known?, useAI? } -> verified competitor candidates (Method 2)
    discover: wrap(async (req, res) => res.json({ success: true, data: await discoverCompetitors({ ...(req.body || {}), userId: req.user?._id }) })),

    // POST /pipeline { productId, competitors, prompt, useAI, method } -> 202, runs in the background
    startPipeline: wrap(async (req, res) => res.status(202).json({ success: true, data: await intel.startPipeline({ ...(req.body || {}), userId: req.user?._id }) })),

    // GET /:id/progress -> live agent status (poll while status === "running")
    progress: wrap(async (req, res) => res.json({ success: true, data: await intel.getProgress(req.params.id) })),

    // POST /:id/results -> Performance Analysis + Strategy Improvement on published posts
    results: wrap(async (req, res) => res.json({ success: true, data: await intel.analyzeResults(req.params.id) })),
};
