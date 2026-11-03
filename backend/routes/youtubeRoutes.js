// ─────────────────────────────────────────────────────────────
// routes/youtubeRoutes.js — YouTube Channel & Post Studio API
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    testConnection,
    getAccount,
    connectChannel,
    disconnectChannel,
} = require("../controllers/youtubeController.js");

const {
    generate,
    listPosts,
    getPost,
    updatePost,
    revisePost,
    uploadMedia,
    approvePost,
    publishPost,
    schedulePost,
    cancelSchedule,
    generateThumbnail,
    getThumbnailArchetypes,
} = require("../controllers/youtubePostController.js");

const youtubeRouter = express.Router();

// Channel management & overview
youtubeRouter.get("/test", testConnection);
youtubeRouter.get("/account", getAccount);
youtubeRouter.post("/connect", connectChannel);
youtubeRouter.post("/disconnect", disconnectChannel);

// Dedicated YouTube Thumbnail Generator (High CTR, Big Bold Text, No Instagram Layout)
youtubeRouter.post("/thumbnails/generate", generateThumbnail);
youtubeRouter.get("/thumbnails/archetypes", getThumbnailArchetypes);

// Post Studio: AI Drafting, Revisions & Publishing
youtubeRouter.post("/posts/generate", generate);
youtubeRouter.get("/posts", listPosts);
youtubeRouter.get("/posts/:id", getPost);
youtubeRouter.patch("/posts/:id", updatePost);
youtubeRouter.post("/posts/:id/revise", revisePost);
youtubeRouter.post("/posts/:id/approve", approvePost);
youtubeRouter.post("/posts/:id/publish", publishPost);
youtubeRouter.post("/posts/:id/schedule", schedulePost);
youtubeRouter.delete("/posts/:id/schedule", cancelSchedule);

// Media Uploads (Raw body for Video .mp4/.mov and Thumbnail .jpg/.png up to 300MB)
youtubeRouter.post(
    "/media",
    express.raw({ type: ["image/*", "video/*"], limit: process.env.MAX_UPLOAD_SIZE || "300mb" }),
    uploadMedia
);

module.exports = youtubeRouter;
