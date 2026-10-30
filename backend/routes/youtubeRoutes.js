// ─────────────────────────────────────────────────────────────
// routes/youtubeRoutes.js — YouTube Channel API
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    testConnection,
    getAccount,
    connectChannel,
    disconnectChannel,
} = require("../controllers/youtubeController.js");

const youtubeRouter = express.Router();

youtubeRouter.get("/test", testConnection);
youtubeRouter.get("/account", getAccount);
youtubeRouter.post("/connect", connectChannel);
youtubeRouter.post("/disconnect", disconnectChannel);

module.exports = youtubeRouter;
