const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      index: true,
      default: () => "conv_" + Math.random().toString(36).substring(2, 10),
    },
    platform: {
      type: String,
      required: true,
      enum: ["instagram", "whatsapp", "facebook", "linkedin", "x", "tiktok", "youtube"],
      default: "instagram",
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    senderRole: {
      type: String,
      default: "Customer",
    },
    lastMessageText: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unread: {
      type: Boolean,
      default: true,
    },
    intent: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    sentiment: {
      type: String,
      enum: ["sales", "positive", "negative", "issue", "question", "neutral"],
      default: "neutral",
    },
    tag: {
      type: [String],
      default: ["blue", "Question"], // [color, label]
    },
    priority: {
      type: String,
      enum: ["high", "normal", "low"],
      default: "normal",
    },
    status: {
      type: String,
      enum: ["open", "escalated", "archived", "closed"],
      default: "open",
      index: true,
    },
    assignedTo: {
      type: String,
      default: null,
    },
    aiSuggestedReply: {
      type: String,
      default: "",
    },
    aiConfidence: {
      type: Number,
      default: 90,
    },
    autoReplied: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ platform: 1, senderId: 1 }, { unique: true });

module.exports = mongoose.model("Conversation", conversationSchema);
