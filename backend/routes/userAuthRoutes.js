// ─────────────────────────────────────────────────────────────
// userAuthRoutes.js — User Signup, Login, Google OAuth, & Profile
// ─────────────────────────────────────────────────────────────
const express = require("express");
const {
    signup,
    login,
    googleAuth,
    getMe,
} = require("../controllers/userAuthController.js");
const { requireAuth } = require("../middleware/authMiddleware.js");

const userAuthRouter = express.Router();

userAuthRouter.post("/signup", signup);
userAuthRouter.post("/register", signup); // alias for flexibility
userAuthRouter.post("/login", login);
userAuthRouter.post("/google", googleAuth);
userAuthRouter.get("/me", requireAuth, getMe);

module.exports = userAuthRouter;
