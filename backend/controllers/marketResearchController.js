// ─────────────────────────────────────────────────────────────
// marketResearchController.js — HTTP layer only: read request, call service, send JSON.
// ─────────────────────────────────────────────────────────────
const service = require("../services/marketResearchService.js");

// One place to turn errors into responses (uses err.statusCode set by the service)
const sendError = (res, error) =>
    res.status(error.statusCode || 500).json({ success: false, message: error.message });

// POST /api/market-research/:productId
// Body (all optional): { "platforms": ["instagram"] ["youtube"], "researchData": { "instagram": [...] } }
// Query: ?wait=true -> wait for the full report (Postman testing)
const startResearch = async (req, res) => {
    try {
        // console.log(" [Controller] Received request for product:", req.params.productId);
        // STEP 1: body can be text (express.text) — only use it when it is an object
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const wait = String(req.query.wait).toLowerCase() === "true";

        // STEP 2: run
        const doc = await service.startResearch(req.params.productId, {
            platforms: body.platforms,
            researchData: body.researchData,
            wait,
        });

        // STEP 3: 202 Accepted = "started, not finished yet"; 200 = finished report
        return res.status(wait ? 200 : 202).json({
            success: true,
            message: wait ? "Market research finished" : "Market research started — poll GET /api/market-research/" + doc._id,
            data: doc,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

// GET /api/market-research/:id
const getResearchById = async (req, res) => {
    try {
        const doc = await service.getResearchById(req.params.id);
        return res.status(200).json({ success: true, data: doc });
    } catch (error) {
        return sendError(res, error);
    }
};

// GET /api/market-research/product/:productId/latest
const getLatestForProduct = async (req, res) => {
    try {
        const doc = await service.getLatestForProduct(req.params.productId);
        return res.status(200).json({ success: true, data: doc });
    } catch (error) {
        return sendError(res, error);
    }
};

// GET /api/market-research/product/:productId
const listForProduct = async (req, res) => {
    try {
        const docs = await service.listForProduct(req.params.productId);
        return res.status(200).json({ success: true, count: docs.length, data: docs });
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = {
    startResearch,
    getResearchById,
    getLatestForProduct,
    listForProduct,
};
