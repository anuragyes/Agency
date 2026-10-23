// ─────────────────────────────────────────────────────────────
// models/MarketResearch.js — one document = one research run for one product.
// We keep every run (history), so you can compare research over time.
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const MarketResearchSchema = new mongoose.Schema(
    {
        // STEP 1: link to the product from Phase 1
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },

        // STEP 2: lifecycle — running -> completed / partial / failed
        status: {
            type: String,
            enum: ["running", "completed", "partial", "failed"],
            default: "running",
            index: true,
        },
        requestedPlatforms: [String],
        progress: { done: { type: Number, default: 0 }, total: { type: Number, default: 0 } },

        // STEP 3: results. Mixed = flexible JSON (shape is enforced by ResearchSchema.js in code)
        platforms: { type: mongoose.Schema.Types.Mixed, default: {} },   // { instagram: {...}, youtube: {...} }
        aggregate: { type: mongoose.Schema.Types.Mixed, default: null }, // Research Aggregator output

        error: String,
        startedAt: Date,
        finishedAt: Date,
        durationMs: Number,
    },
    { timestamps: true, minimize: false }   // minimize:false keeps empty objects like {} in the DB
);

// Fast "latest research for this product" query
MarketResearchSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model("MarketResearch", MarketResearchSchema);
