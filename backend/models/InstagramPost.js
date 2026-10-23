// ─────────────────────────────────────────────────────────────
// InstagramPost — one AI-made Instagram post / reel / carousel
// Lifecycle: draft -> (user edits / asks AI to change) -> approved [-> scheduled (date & time)] -> publishing -> published | failed
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["image", "video"], required: true },
        url: { type: String, required: true },   // must be public for Instagram to download it
        mimeType: String,
        source: { type: String, enum: ["upload", "url"], default: "url" },
    },
    { _id: false }
);

const InstagramPostSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
        productProfile: { type: Object },        // snapshot used to write the post
        brief: { type: Object },                 // compact content brief from the Studio (ContentBriefAgent)
        instagramResearch: { type: Object },     // snapshot of the research used (instargramAgent output, or brief research)

        contentType: { type: String, enum: ["image", "reel", "carousel"], required: true },
        status: {
            type: String,
            enum: ["draft", "approved", "scheduled", "publishing", "published", "failed"],
            default: "draft",
            index: true,
        },

        // "Schedule for later" (Editor -> Approve -> pick date & time): services/postScheduler.js publishes the
        // post by itself when this time comes. status "scheduled" = approved + waiting for scheduledAt.
        scheduledAt: { type: Date, index: true },
        scheduledPlacement: { type: String, enum: ["feed", "story"] }, // where it goes at that time

        content: { type: Object, required: true }, // see InstagramPostValidator.normalizeInstagramPost
        media: { type: [MediaSchema], default: [] },
        coverUrl: String,                          // optional reel cover image (public JPEG)

        // every AI / manual change, newest last -> lets the user see what changed
        revisions: [
            {
                by: { type: String, enum: ["ai", "user"] },
                prompt: String,
                at: { type: Date, default: Date.now },
                _id: false,
            },
        ],

        instagram: {
            containerId: String,
            mediaId: String,
            permalink: String,
            placement: { type: String, enum: ["feed", "story"], default: "feed" }, // where it was published
            publishedAt: Date,
            error: String,
        },
        performanceLearnings: { type: Object },
    },
    { timestamps: true }
);

module.exports = mongoose.model("InstagramPost", InstagramPostSchema);
