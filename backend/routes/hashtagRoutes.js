// Real hashtag data per platform (Instagram live, others ready for their APIs) — see services/hashtags/index.js
const express = require("express");
const { getPlatforms, explore, quota } = require("../controllers/hashtagController.js");

const hashtagRouter = express.Router();

hashtagRouter.get("/platforms", getPlatforms);          // which platforms exist / are live
hashtagRouter.post("/:platform/explore", explore);      // "Find real hashtags"  { seeds }
hashtagRouter.get("/:platform/quota", quota);           // searches used (if the platform has a limit)

module.exports = hashtagRouter;
