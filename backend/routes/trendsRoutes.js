const express = require("express");
const { getProjectTrends } = require("../services/googleTrendsService.js");

const trendsRouter = express.Router();

trendsRouter.post("/topics", async (req, res, next) => {
    try {
        const data = await getProjectTrends({ terms: req.body?.terms, geo: req.body?.geo });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("[trends] Google Trends request failed", {
            code: error.code,
            status: error.statusCode || error.status,
            message: error.message,
            response: String(error.requestBody || "").slice(0, 180),
        });
        error.statusCode = error.statusCode || 502;
        error.message = "Google Trends is temporarily unavailable. Please try again shortly.";
        return next(error);
    }
});

module.exports = trendsRouter;
