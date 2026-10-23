const express = require("express");
const { listPlatforms, createBrief } = require("../controllers/contentController.js");

const contentRouter = express.Router();

contentRouter.get("/platforms", listPlatforms);
contentRouter.post("/brief", createBrief); // Studio step 1: prompt + platform -> compact JSON brief

module.exports = contentRouter;
