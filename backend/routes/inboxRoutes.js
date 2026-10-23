// ─────────────────────────────────────────────────────────────
// routes/inboxRoutes.js — Unified Inbox Routes
// ─────────────────────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const {
  verifyWebhook,
  receiveWebhook,
  simulateWebhook,
  syncRealMetaConversations,
  getConversations,
  getConversationMessages,
  sendReply,
  updateConversation,
  getInboxStats,
  toggleAutoReply,
} = require("../controllers/inboxController");

// Real Meta Sync
router.post("/sync", syncRealMetaConversations);

// Meta Webhooks
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

// Dev / Testing Webhook Simulator
router.post("/simulate", simulateWebhook);

// Inbox Conversations & Messages
router.get("/conversations", getConversations);
router.get("/conversations/:id/messages", getConversationMessages);
router.post("/conversations/:id/reply", sendReply);
router.patch("/conversations/:id", updateConversation);

// Telemetry & Settings
router.get("/stats", getInboxStats);
router.post("/auto-reply", toggleAutoReply);

module.exports = router;
