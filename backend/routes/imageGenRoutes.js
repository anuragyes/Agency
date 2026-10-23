// ─────────────────────────────────────────────────────────────
// imageGenRoutes.js — AI product ad images  (mounted at /api/image-gen in server.js)
// Flow: prompt -> AI plans texts + 4 styles -> up to 4 photos in different styles (background, UI polls ?batchId=)
//       -> real typography + logo -> JPEGs; the user picks one (image post) or several (carousel)
// The older sketch flow (layout -> revise/edit -> approve -> generate) is kept for old jobs / API users.
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    getOptions,
    getStorage,
    getHealth,
    planLayout,
    createBatch,
    batchTexts,
    createLayout,
    listJobs,
    getJob,
    reviseLayout,
    editLayout,
    approveLayout,
    generateImage,
    composeImage,
} = require("../controllers/imageGenController.js");

const imageGenRouter = express.Router();

imageGenRouter.get("/options", getOptions);            // compositions / shapes / aspect ratios
imageGenRouter.get("/storage", getStorage);            // media on Cloudinary (public links) or local disk?
imageGenRouter.get("/health", getHealth);              // photo engine ready? (Stability AI / local SD WebUI)
imageGenRouter.post("/plan", planLayout);              // 6-step flow: prompt -> optimized photo prompt + texts + styles (LLM, nothing saved)
imageGenRouter.post("/batch", createBatch);            // MAIN: prompt -> up to 4 photos in different styles (no sketch)
imageGenRouter.post("/batch/:batchId/texts", batchTexts); // new headline / subline / CTA on every photo of the set
imageGenRouter.post("/layout", createLayout);          // 1. prompt -> layout + SVG preview (LLM)
imageGenRouter.get("/", listJobs);                     // ?productId=&postId=&batchId=
imageGenRouter.get("/:id", getJob);
imageGenRouter.post("/:id/revise", reviseLayout);      // 2a. AI changes the sketch from feedback
imageGenRouter.patch("/:id/layout", editLayout);       // 2b. manual edits (texts, composition, shape...)
imageGenRouter.post("/:id/approve", approveLayout);    // 3. user approves the sketch
imageGenRouter.post("/:id/generate", generateImage);   // one photo again (also "Try again" on one image of a set) / 4. sketch -> photo (Stability AI | SD + ControlNet) -> typography + logo -> JPEG
imageGenRouter.post("/:id/compose", composeImage);     // re-apply text / logo on the same photo

module.exports = imageGenRouter;
