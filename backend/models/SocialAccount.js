// ─────────────────────────────────────────────────────────────
// SocialAccount.js — Multi-tenant Social Account & Token Storage
// Stores OAuth tokens, channel IDs, and refresh tokens per user/product.
// Supports: Instagram, Facebook, YouTube, X (Twitter), WhatsApp, etc.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const SocialAccountSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
        platform: {
            type: String,
            enum: ["instagram", "facebook", "youtube", "x", "threads", "whatsapp"],
            required: true,
            index: true,
        },
        // Platform's unique identifier (e.g., IG Business ID, FB Page ID, YouTube Channel ID)
        accountId: { type: String, required: true },
        username: { type: String, default: "" },
        name: { type: String, default: "" },
        profilePictureUrl: { type: String, default: null },

        // Access tokens (long-lived 60-day Meta token or bearer token)
        accessToken: { type: String, required: true },
        refreshToken: { type: String, default: null },
        tokenExpiresAt: { type: Date, default: null },

        // Associated Page or parent container (for Instagram accounts linked to a Facebook Page)
        parentAccountId: { type: String, default: null },
        parentAccountName: { type: String, default: null },

        // Scopes / permissions granted
        scopes: { type: [String], default: [] },

        // Extra metadata (follower counts, category, bio snapshot)
        metadata: { type: Object, default: {} },

        status: {
            type: String,
            enum: ["connected", "expired", "revoked", "reconnect"],
            default: "connected",
            index: true,
        },
    },
    { timestamps: true }
);

// Compound index: one platform per product workspace
SocialAccountSchema.index({ productId: 1, platform: 1 }, { unique: false });

module.exports = mongoose.model("SocialAccount", SocialAccountSchema);
