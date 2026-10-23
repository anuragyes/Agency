// Competitor research (real API data + grounded AI report) — mounted at /api/competitor-research
const express = require("express");
const c = require("../controllers/competitorResearchController.js");

const router = express.Router();

// specific paths BEFORE "/:id"
router.get("/platforms", c.platforms);
router.get("/agents", c.agents);
router.post("/discover", c.discover);
router.post("/pipeline", c.startPipeline);
router.get("/product/:productId", c.list);
router.get("/:platform/lookup", c.lookup);
router.post("/", c.run);
router.get("/:id", c.get);
router.post("/:id/approve", c.approve);
router.post("/:id/posts", c.linkPost);
router.get("/:id/progress", c.progress);
router.post("/:id/results", c.results);

module.exports = router;
