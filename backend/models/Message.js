const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    senderType: {
      type: String,
      enum: ["user", "brand", "ai"],
      required: true,
      default: "user",
    },
    text: {
      type: String,
      required: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mid: {
      type: String,
      default: null,
      index: true,
    },
    isEcho: {
      type: Boolean,
      default: false,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["received", "filtered", "queued", "processed", "sent", "failed"],
      default: "received",
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
