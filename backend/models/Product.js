const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        rawInput: {
            type: String,
            required: true,
        },

        // brand mark on AI-generated ad images: a logo OR an icon — only ONE is kept (uploading one removes the other)
        logoUrl: String,   // brand logo (already cut out / transparent) — drawn as uploaded, no background
        iconUrl: String,   // brand icon (already cut out / transparent) — drawn as uploaded, smaller than a logo
        logoAltUrl: String, // legacy (white-background logo) — no longer used, cleared on the next logo / icon upload
        photoUrl: String,  // real product photo (packshot) — placed into AI-generated scenes so the label stays exact

        // Project website link & RAG knowledge markdown
        websiteUrl: String,
        knowledgeMd: String,
        knowledgeFilePath: String,

        // Structured RAG knowledge chunks for fast, low-token retrieval
        knowledgeChunks: [
            {
                chunkId: { type: String, required: true },
                title: { type: String, required: true },
                category: { type: String, default: "general" },
                content: { type: String, required: true },
                tags: [String],
                updatedAt: { type: Date, default: Date.now },
            },
        ],

        aiProfile: {
            name: String,
            category: String,
            description: String,
            features: [String],
            benefits: [String],
            uses: [String],
            targetAudience: [String],
            price: {
                amount: Number,
                currency: String,
            },
            positioning: String,
            keywords: [String],
            websiteSummary: String,
            knowledgeMd: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);