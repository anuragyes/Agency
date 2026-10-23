// ─────────────────────────────────────────────────────────────
// models/CompetitorResearch.js — one document = one competitor research report.
//   real data (API) + numbers (code) + written analysis (LLM, grounded on the numbers)
//   draft -> approved -> posts created from the approved ideas
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const CompetitorResearchSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
        productName: String,
        platform: { type: String, default: "instagram" },
        competitors: [String],                 // usernames the user confirmed
        prompt: String,                        // what the user wants to achieve
        method: { type: String, enum: ["manual", "discovery"], default: "manual" }, // how competitors were chosen
        useAI: { type: Boolean, default: true },                                    // false = 0 LLM calls in the whole run

        status: { type: String, enum: ["running", "completed", "partial", "failed"], default: "running" },
        data: { type: mongoose.Schema.Types.Mixed, default: null },      // real data + computed metrics
        analysis: { type: mongoose.Schema.Types.Mixed, default: null },  // LLM report (grounded)
        analysisError: String,
        // multi-agent pipeline (services/competitorIntelligence): live agent status + every agent's output
        pipeline: { type: mongoose.Schema.Types.Mixed, default: null },      // agents[], counters, live, log
        intelligence: { type: mongoose.Schema.Types.Mixed, default: null },  // posts, audience, performance, gaps, opportunities, strategy, ideas, briefs, quality, results
        error: String,

        approval: {
            status: { type: String, enum: ["draft", "approved"], default: "draft" },
            approvedAt: Date,
        },
        posts: [{ ideaIndex: Number, postId: { type: mongoose.Schema.Types.ObjectId, ref: "InstagramPost" }, createdAt: Date }],

        durationMs: Number,
    },
    { timestamps: true, minimize: false }
);

CompetitorResearchSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model("CompetitorResearch", CompetitorResearchSchema);
