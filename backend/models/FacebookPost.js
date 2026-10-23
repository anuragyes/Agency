// ─────────────────────────────────────────────────────────────
// FacebookPost — one AI-made Facebook Page post (text / photo / photo album / reel)
// Same lifecycle as InstagramPost: draft -> approved [-> scheduled] -> publishing -> published | failed
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["image", "video"], required: true },
        url: { type: String, required: true },   // must be public for Facebook to download it
        mimeType: String,
        source: { type: String, enum: ["upload", "url"], default: "url" },
    },
    { _id: false }
);

const FacebookPostSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
        productProfile: { type: Object },
        brief: { type: Object },                 // compact content brief from the Studio
        research: { type: Object },              // FacebookBriefResearch (your Page's real posts) or competitor research

        contentType: { type: String, enum: ["text", "image", "carousel", "reel"], required: true },
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

        content: { type: Object, required: true }, // see FacebookPostValidator.normalizeFacebookPost
        media: { type: [MediaSchema], default: [] },

        revisions: [
            {
                by: { type: String, enum: ["ai", "user"] },
                prompt: String,
                at: { type: Date, default: Date.now },
                _id: false,
            },
        ],

        facebook: {
            postId: String,
            mediaId: String,
            permalink: String,
            placement: { type: String, enum: ["feed", "story"], default: "feed" },
            processing: Boolean,                   // reel still being processed by Facebook when we returned
            publishedAt: Date,
            error: String,
        },
        performanceLearnings: { type: Object },
    },
    { timestamps: true }
);

module.exports = mongoose.model("FacebookPost", FacebookPostSchema);
