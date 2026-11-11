// ─────────────────────────────────────────────────────────────
// weeklyPlanController.js — API Handlers for 7-Day Batch Planner
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const WeeklyPlan = require("../models/WeeklyPlan.js");
const Product = require("../models/Product.js");
const { generateWeeklyPlan } = require("../ai/weeklyPlan/WeeklyPlannerAgent.js");
const {
  executeBatchGeneration,
  regenerateSingleSlot,
  scheduleApprovedSlots,
} = require("../services/weeklyPlanService.js");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/**
 * POST /api/weekly-planner/create
 * Generates the strategic 7-day plan blueprint via WeeklyPlannerAgent + RAG
 */
const createPlan = async (req, res, next) => {
  try {
    const { productId, weekStartDate, campaignGoal, platforms, customPrompt } = req.body || {};
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return fail(res, 400, "Valid productId is required");
    }

    const product = await Product.findById(productId);
    if (!product) return fail(res, 404, "Product not found");

    const planData = await generateWeeklyPlan({
      productId,
      productProfile: product.aiProfile || {},
      campaignGoal: campaignGoal || "Engagement & Brand Growth",
      platforms: Array.isArray(platforms) && platforms.length ? platforms : ["instagram"],
      weekStartDate: weekStartDate ? new Date(weekStartDate) : new Date(),
      customPrompt: customPrompt || "",
    });

    const newPlan = await WeeklyPlan.create({
      userId: req.user?._id || product.userId,
      productId,
      weekStartDate: planData.weekStartDate,
      weekEndDate: planData.weekEndDate,
      campaignGoal: planData.campaignGoal,
      platforms: planData.platforms,
      slots: planData.slots,
      overallStatus: "blueprint",
    });

    return res.status(201).json({ success: true, data: newPlan });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/weekly-planner/latest?productId=...
 */
const getLatestPlan = async (req, res, next) => {
  try {
    const { productId } = req.query;
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return fail(res, 400, "Valid productId is required");
    }

    const plan = await WeeklyPlan.findOne({ productId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/weekly-planner/:id
 */
const getPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid plan ID");

    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/weekly-planner/:id
 * Removes or resets the weekly plan so user can start a fresh sprint
 */
const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid plan ID");

    await WeeklyPlan.findByIdAndDelete(id);
    return res.json({ success: true, message: "Weekly plan reset successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/slots
 * Add a custom slot to a day (supports multiple posts on one day)
 */
const addSlot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dayName, date, format, topic, hook, time, platform } = req.body || {};

    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    const dayPrefix = (dayName || "day").slice(0, 3).toLowerCase();
    const existingCount = plan.slots.filter((s) => (s.dayName || "").toLowerCase() === (dayName || "").toLowerCase()).length;
    const slotId = `${dayPrefix}-${existingCount + 1}`;

    const newSlot = {
      slotId,
      dayName: dayName || "Monday",
      date: date ? new Date(date) : new Date(plan.weekStartDate),
      time: time || "14:00",
      platform: platform || plan.platforms[0] || "instagram",
      format: format || "image",
      topic: topic || "Bonus Social Post",
      hook: hook || "Here is something you should know.",
      imagePrompt: `Clean, modern social post graphic for ${topic || "brand"}`,
      status: "blueprint",
      isApproved: false,
    };

    plan.slots.push(newSlot);
    await plan.save();

    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/weekly-planner/:id/slots/:slotId
 * Update an individual slot's details (topic, time, format, caption, hashtags)
 */
const updateSlot = async (req, res, next) => {
  try {
    const { id, slotId } = req.params;
    const updates = req.body || {};

    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    const slot = plan.slots.find((s) => s.slotId === slotId);
    if (!slot) return fail(res, 404, "Slot not found");

    if (updates.topic !== undefined) slot.topic = updates.topic;
    if (updates.hook !== undefined) slot.hook = updates.hook;
    if (updates.time !== undefined) slot.time = updates.time;
    if (updates.format !== undefined) slot.format = updates.format;
    if (updates.caption !== undefined) slot.caption = updates.caption;
    if (updates.hashtags !== undefined) slot.hashtags = updates.hashtags;
    if (updates.platform !== undefined) slot.platform = updates.platform;

    await plan.save();
    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/weekly-planner/:id/slots/:slotId
 * Remove a post slot (or skip day)
 */
const removeSlot = async (req, res, next) => {
  try {
    const { id, slotId } = req.params;
    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    plan.slots = plan.slots.filter((s) => s.slotId !== slotId);
    await plan.save();

    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/generate-assets
 * Triggers parallel generation of captions & images
 */
const generateAssets = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Send response right away or let it complete
    const updatedPlan = await executeBatchGeneration(id);
    return res.json({ success: true, data: updatedPlan });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/slots/:slotId/regenerate
 * Re-rolls a single slot
 */
const regenerateSlot = async (req, res, next) => {
  try {
    const { id, slotId } = req.params;
    const updatedPlan = await regenerateSingleSlot(id, slotId);
    return res.json({ success: true, data: updatedPlan });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/slots/:slotId/approve
 * Toggles approval on a single slot
 */
const toggleApproval = async (req, res, next) => {
  try {
    const { id, slotId } = req.params;
    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    const slot = plan.slots.find((s) => s.slotId === slotId);
    if (!slot) return fail(res, 404, "Slot not found");

    slot.isApproved = !slot.isApproved;
    await plan.save();

    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/approve-all
 * Approves all ready slots in one click
 */
const approveAll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await WeeklyPlan.findById(id);
    if (!plan) return fail(res, 404, "Weekly plan not found");

    plan.slots.forEach((s) => {
      if (s.status === "ready") {
        s.isApproved = true;
      }
    });

    await plan.save();
    return res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/weekly-planner/:id/schedule-all
 * Pushes approved slots into live Post models
 */
const scheduleAll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    const result = await scheduleApprovedSlots(id, userId);

    return res.json({
      success: true,
      message: `Successfully scheduled ${result.scheduledCount} posts to your calendar!`,
      data: result.plan,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};

