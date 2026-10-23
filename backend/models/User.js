// ─────────────────────────────────────────────────────────────
// User.js — User Account Schema (Email/Password, Google OAuth)
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        password: {
            type: String,
            // optional for OAuth users (Google / LinkedIn / Apple)
            select: false,
        },
        authProvider: {
            type: String,
            enum: ["email", "google", "linkedin", "apple"],
            default: "email",
        },
        googleId: {
            type: String,
            sparse: true,
            index: true,
        },
        avatar: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
