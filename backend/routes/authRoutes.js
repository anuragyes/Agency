// ─────────────────────────────────────────────────────────────
// authRoutes.js — Multi-tenant OAuth & Connected Accounts Routes
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    connectMeta,
    handleMetaCallback,
    listConnectedAccounts,
    disconnectAccount,
} = require("../controllers/authController.js");
const { optionalAuth } = require("../middleware/authMiddleware.js");

const authRouter = express.Router();

authRouter.use(optionalAuth);

// Meta OAuth (Instagram & Facebook)
authRouter.get("/meta/connect", connectMeta);
authRouter.get("/meta/callback", handleMetaCallback);

// Account management
authRouter.get("/accounts", listConnectedAccounts);
authRouter.delete("/accounts/:id", disconnectAccount);

module.exports = authRouter;
