// ─────────────────────────────────────────────────────────────
// authMiddleware.js — JWT Verification & Route Protection
// ─────────────────────────────────────────────────────────────
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

const JWT_SECRET = process.env.JWT_SECRET || "sociva_jwt_super_secret_key_2026_growth_engine";

/**
 * Require valid JWT Bearer token in Authorization header
 */
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : req.query.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in to access this feature.",
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password").lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account not found or has been deactivated.",
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired session. Please sign in again.",
        });
    }
};

/**
 * Optional Auth: Attaches req.user if valid token exists, but doesn't block if not
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : req.query.token;

        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id).select("-password").lean();
            if (user) req.user = user;
        }
    } catch {
        // Ignore token errors in optional auth
    }
    next();
};

module.exports = {
    requireAuth,
    optionalAuth,
    JWT_SECRET,
};
