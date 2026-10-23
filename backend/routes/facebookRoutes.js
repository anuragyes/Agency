// /api/facebook — Facebook Page: real data + Post Studio (research -> post -> review -> approve -> publish)
const express = require("express");
const { testConnection, getAccount, getCompetitor } = require("../controllers/facebookController.js");
const {
    researchFromBrief,
    generatePost,
    listPosts,
    getPost,
    updatePost,
    revisePost,
    approvePost,
    publishPost,
    schedulePost,
    unschedulePost,
    uploadMedia,
} = require("../controllers/facebookPostController.js");

const facebookRouter = express.Router();

facebookRouter.get("/test", testConnection);
facebookRouter.get("/account", getAccount);            // your Page: followers, engagement, recent posts
facebookRouter.get("/competitor", getCompetitor);      // ?page=nike -> another Page (needs Meta approval)

facebookRouter.post("/brief/research", researchFromBrief);

facebookRouter.post("/posts/generate", generatePost);
facebookRouter.get("/posts", listPosts);
facebookRouter.get("/posts/:id", getPost);
facebookRouter.patch("/posts/:id", updatePost);
facebookRouter.post("/posts/:id/revise", revisePost);
facebookRouter.post("/posts/:id/approve", approvePost);
facebookRouter.post("/posts/:id/publish", publishPost);
facebookRouter.post("/posts/:id/schedule", schedulePost);       // "Schedule for later": { scheduledAt, placement } -> auto-publish then
facebookRouter.delete("/posts/:id/schedule", unschedulePost);   // cancel the schedule

// raw body upload (Content-Type: image/jpeg | image/png | video/mp4 | video/quicktime)
facebookRouter.post(
    "/media",
    express.raw({ type: ["image/*", "video/*"], limit: process.env.MAX_UPLOAD_SIZE || "300mb" }),
    uploadMedia
);

module.exports = facebookRouter;
