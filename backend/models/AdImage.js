// ─────────────────────────────────────────────────────────────
// AdImage — one AI product ad image (image generation feature)
// Lifecycle (current UI): prompt -> up to 4 jobs in different styles (same batchId), created "generating" -> done | failed
// Legacy lifecycle (sketch review): layout -> approved -> generating -> done | failed
//   User prompt -> SVG layout preview -> user approval -> SVG -> PNG -> ControlNet Scribble + realistic checkpoint
//   -> photorealistic photo -> real typography + logo on top -> final JPEG (added to the post's media)
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const AdImageSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
        postId: { type: mongoose.Schema.Types.ObjectId, index: true }, // the draft it was made for (optional)
        platform: { type: String, enum: ["instagram", "facebook", null], default: null },
        batchId: { type: String, index: true },     // one prompt -> up to 4 photos in different styles share a batchId
        style: { type: String },                     // style of this photo in its batch ("Clean studio", "Lifestyle"...)

        prompt: { type: String, required: true },   // what the user asked for
        layout: { type: Object, required: true },   // AdLayoutAgent.normalizeLayout() output
        status: {
            type: String,
            enum: ["layout", "approved", "generating", "done", "failed"],
            default: "layout",
            index: true,
        },
        layoutApprovedAt: Date,

        images: {
            controlUrl: String,  // what the engine got: sketch PNG, or your product photo placed in the layout
            rawUrl: String,      // AI photo, no text
            finalUrl: String,    // final ad JPEG with typography + logo (what gets posted)
        },
        generation: {
            provider: String,    // "gemini" | "stability" | "webui"
            mode: String,        // "product" (your photo in an AI scene) | "scene" | "sketch"
            seed: Number,
            steps: Number,
            cfgScale: Number,
            controlWeight: Number,
            checkpoint: String,
            controlModel: String,
            theme: String,       // "light" (white text) | "dark" (dark text) — picked from the photo
            ms: Number,
            prompt: String,      // exact prompt sent to the image model (Gemini) — shown in the UI
            startedAt: Date,
        },
        // earlier results (regenerate = new seed) -> the user can go back to one they liked
        history: [{ finalUrl: String, rawUrl: String, seed: Number, at: { type: Date, default: Date.now }, _id: false }],
        revisions: [{ by: { type: String, enum: ["ai", "user"] }, prompt: String, at: { type: Date, default: Date.now }, _id: false }],
        usage: { type: Object },
        warnings: [String],
        error: String,
    },
    { timestamps: true }
);

module.exports = mongoose.model("AdImage", AdImageSchema);
