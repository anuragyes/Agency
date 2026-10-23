// ─────────────────────────────────────────────────────────────
// facebookController.js — real Facebook Page data
//   GET /api/facebook/test                          is the Page connected? (name, followers)
//   GET /api/facebook/account?limit=25              your Page: profile, stats, recent posts
//   GET /api/facebook/competitor?page=<username|id|link>   another Page (needs Page Public Content Access)
// ─────────────────────────────────────────────────────────────
const { testFacebookConnection } = require("../services/facebookService.js");
const { getFacebookPageOverview, getFacebookCompetitorPage } = require("../services/facebookInsightsService.js");

const limitOf = (q, def) => Math.min(100, Math.max(1, Number(q) || def));
const sendError = (res, next, err) => (err.statusCode ? res.status(err.statusCode).json({ success: false, message: err.message }) : next(err));

const testConnection = async (req, res, next) => {
    try {
        return res.json({ success: true, data: await testFacebookConnection() });
    } catch (err) {
        return sendError(res, next, err);
    }
};

const getAccount = async (req, res, next) => {
    try {
        return res.json({
            success: true,
            data: await getFacebookPageOverview({
                productId: req.query.productId,
                userId: req.user?._id,
                postLimit: limitOf(req.query.limit, 25),
            }),
        });
    } catch (err) {
        return sendError(res, next, err);
    }
};

const getCompetitor = async (req, res, next) => {
    try {
        const ref = req.query.page || req.query.username;
        if (!ref) return res.status(400).json({ success: false, message: "Send ?page=<Facebook Page username, id or link>" });
        return res.json({ success: true, data: await getFacebookCompetitorPage(ref, { postLimit: limitOf(req.query.limit, 30) }) });
    } catch (err) {
        return sendError(res, next, err);
    }
};

module.exports = { testConnection, getAccount, getCompetitor };
