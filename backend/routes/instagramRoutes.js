const express = require("express");

const instagramRouter = express.Router();

const {
    testInstagramConnection,
    researchInstagram,
    getFollowers,
    getInstagramHashtags,
    getInstagramAccount,
    getInstagramCompetitor,
    getInstagramAudienceData,
    getMediaDetails,
} = require("../controllers/instagramController.js");

const {
    researchFromBrief,
    startResearchJob,
    getResearchJob,
    applyLiveHashtags,
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
    createInstagramStory,
} = require("../controllers/instagramPostController.js");

instagramRouter.get("/test", testInstagramConnection);

// Step 1 — research (hashtags, keywords, audience, ideas)
instagramRouter.post("/instargramAgent/research", researchInstagram);

// Studio step 3 — the Instagram agent researches the content brief (live hashtags, no LLM)
instagramRouter.post("/brief/research", researchFromBrief);
// Same research as a background job (BullMQ + Redis, worker: npm run worker): jobId at once, then poll for progress
instagramRouter.post("/brief/research/jobs", startResearchJob);
instagramRouter.get("/brief/research/jobs/:jobId", getResearchJob);

// Step 2 — create -> review / edit / AI revise -> approve -> "can I upload?" -> publish
instagramRouter.post("/posts/generate", generatePost);
instagramRouter.get("/posts", listPosts);
instagramRouter.get("/posts/:id", getPost);
instagramRouter.patch("/posts/:id", updatePost);
instagramRouter.post("/posts/:id/revise", revisePost);
instagramRouter.post("/posts/:id/live-hashtags", applyLiveHashtags);   // draft -> refine with live research
instagramRouter.post("/posts/:id/approve", approvePost);
instagramRouter.post("/posts/:id/publish", publishPost);
instagramRouter.post("/posts/:id/schedule", schedulePost);       // "Schedule for later": { scheduledAt, placement } -> auto-publish then
instagramRouter.delete("/posts/:id/schedule", unschedulePost);   // cancel the schedule
instagramRouter.get("/followers", getFollowers);
instagramRouter.get("/instagram/followers", getFollowers); // old URL kept so nothing breaks

instagramRouter.post("/story/publish", createInstagramStory);



instagramRouter.get("/instagram/hashtag-search", getInstagramHashtags);

// Real data for the frontend (Accounts page & Post Analyst)
instagramRouter.get("/account", getInstagramAccount);                 // profile, followers, engagement rate, recent posts
instagramRouter.get("/competitor", getInstagramCompetitor);           // ?username=brand -> their posts + hashtags
instagramRouter.get("/audience", getInstagramAudienceData);            // Audience page: demographics, online times, reach, formats, sentiment
instagramRouter.get("/media/:mediaId/details", getMediaDetails);       // Post Analyst: live likes, comments, reach, saved

// media upload: send the file as the raw request body (Content-Type: image/jpeg | video/mp4 | video/quicktime)
instagramRouter.post(
    "/media",
    express.raw({ type: ["image/*", "video/*"], limit: process.env.MAX_UPLOAD_SIZE || "300mb" }),
    uploadMedia
);

module.exports = instagramRouter;
