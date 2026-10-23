// ─────────────────────────────────────────────────────────────
// marketResearchRoutes.js — mounted at /api/market-research (see server.js)
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    startResearch,
    getResearchById,
    getLatestForProduct,
    listForProduct,
} = require("../controllers/marketResearchController.js");

const marketResearchRouter = express.Router();

// NOTE: the "/product/..." routes must come BEFORE "/:id", otherwise "product" would be read as an id
marketResearchRouter.get("/product/:productId/latest", getLatestForProduct);  // newest report for a product
marketResearchRouter.get("/product/:productId", listForProduct);             // history of runs
marketResearchRouter.post("/:productId", startResearch);                     // start a new run
marketResearchRouter.get("/:id", getResearchById);                           // one run (poll this)

module.exports = marketResearchRouter;
