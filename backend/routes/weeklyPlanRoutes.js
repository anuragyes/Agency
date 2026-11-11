// ─────────────────────────────────────────────────────────────
// weeklyPlanRoutes.js — API Routes for 7-Day Batch Planner
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
  createPlan,
  getLatestPlan,
  getPlanById,
  addSlot,
  updateSlot,
  removeSlot,
  generateAssets,
  regenerateSlot,
  toggleApproval,
  approveAll,
  scheduleAll,
  deletePlan,
} = require("../controllers/weeklyPlanController.js");

const weeklyPlanRouter = express.Router();

weeklyPlanRouter.post("/create", createPlan);
weeklyPlanRouter.get("/latest", getLatestPlan);
weeklyPlanRouter.get("/:id", getPlanById);
weeklyPlanRouter.delete("/:id", deletePlan);
weeklyPlanRouter.post("/:id/slots", addSlot);
weeklyPlanRouter.patch("/:id/slots/:slotId", updateSlot);
weeklyPlanRouter.delete("/:id/slots/:slotId", removeSlot);
weeklyPlanRouter.post("/:id/generate-assets", generateAssets);
weeklyPlanRouter.post("/:id/slots/:slotId/regenerate", regenerateSlot);
weeklyPlanRouter.post("/:id/slots/:slotId/approve", toggleApproval);
weeklyPlanRouter.post("/:id/approve-all", approveAll);
weeklyPlanRouter.post("/:id/schedule-all", scheduleAll);

module.exports = weeklyPlanRouter;

