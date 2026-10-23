// ─────────────────────────────────────────────────────────────
// userAuthController.js — Email/Password & Google OAuth Authentication
// ─────────────────────────────────────────────────────────────
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const User = require("../models/User.js");
const { JWT_SECRET } = require("../middleware/authMiddleware.js");

const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
};

const formatUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
});

/**
 * POST /api/user/signup
 * Create new account with Name, Email, Password
 */
const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // console.log(req.body);

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide your full name, email, and a password.",
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: "An account with this email address already exists. Please sign in instead.",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long.",
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            authProvider: "email",
        });

        const token = generateToken(user);

        return res.status(201).json({
            success: true,
            token,
            user: formatUser(user),
            message: "Account created successfully! Welcome to Sociva.",
        });
    } catch (err) {
        console.error("[UserAuth] Signup error:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to create account. Please try again.",
        });
    }
};

/**
 * POST /api/user/login
 * Sign in with Email and Password
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please enter both email and password.",
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // User lookup with password field included
        const user = await User.findOne({ email: normalizedEmail }).select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "No account found with this email. Please check your spelling or create an account.",
            });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: `This account was registered with ${user.authProvider}. Please sign in using ${user.authProvider}.`,
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password. Please try again.",
            });
        }

        const token = generateToken(user);

        return res.json({
            success: true,
            token,
            user: formatUser(user),
            message: "Signed in successfully!",
        });
    } catch (err) {
        console.error("[UserAuth] Login error:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to sign in. Please try again.",
        });
    }
};

/**
 * POST /api/user/google
 * Sign in / Sign up with Google OAuth (Google Identity Services ID Token or Access Token)
 */
const googleAuth = async (req, res) => {
    try {
        let credential = req.body.credential;
        let accessToken = req.body.accessToken;

        // Support case where an object was passed as credential
        if (typeof credential === "object" && credential !== null) {
            accessToken = credential.accessToken || accessToken;
            credential = credential.credential || (typeof credential === "string" ? credential : null);
        }

        console.log("[UserAuth] Google auth request:", { hasCredential: !!credential, hasAccessToken: !!accessToken });

        if (!credential && !accessToken) {
            return res.status(400).json({
                success: false,
                message: "Google authentication token is required.",
            });
        }

        let googleUser = null;

        // Method 1: Google ID Token (from Google Identity Services credential response)
        if (credential) {
            try {
                const tokenInfoRes = await axios.get(
                    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
                );
                const payload = tokenInfoRes.data;

                if (!payload || !payload.email) {
                    throw new Error("Invalid Google token payload");
                }

                googleUser = {
                    googleId: payload.sub,
                    email: payload.email.toLowerCase().trim(),
                    name: payload.name || payload.given_name || payload.email.split("@")[0],
                    avatar: payload.picture || null,
                };
            } catch (tokenErr) {
                console.error("[GoogleAuth] Token verification failed:", tokenErr.response?.data || tokenErr.message);
                return res.status(401).json({
                    success: false,
                    message: "Google verification failed. Token is invalid or expired.",
                });
            }
        }
        // Method 2: Google Access Token (userinfo endpoint)
        else if (accessToken) {
            try {
                const userInfoRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                const payload = userInfoRes.data;
                googleUser = {
                    googleId: payload.sub,
                    email: payload.email.toLowerCase().trim(),
                    name: payload.name || payload.given_name || payload.email.split("@")[0],
                    avatar: payload.picture || null,
                };
            } catch (accessErr) {
                return res.status(401).json({
                    success: false,
                    message: "Google access token verification failed.",
                });
            }
        }

        if (!googleUser || !googleUser.email) {
            return res.status(400).json({
                success: false,
                message: "Unable to retrieve Google user profile.",
            });
        }

        // Find or create user
        let user = await User.findOne({ email: googleUser.email });

        if (user) {
            // Update Google ID and avatar if needed
            let modified = false;
            if (!user.googleId) {
                user.googleId = googleUser.googleId;
                modified = true;
            }
            if (googleUser.avatar && !user.avatar) {
                user.avatar = googleUser.avatar;
                modified = true;
            }
            if (modified) await user.save();
        } else {
            // Create new Google OAuth user
            user = await User.create({
                name: googleUser.name,
                email: googleUser.email,
                avatar: googleUser.avatar,
                googleId: googleUser.googleId,
                authProvider: "google",
            });
        }

        const token = generateToken(user);

        return res.json({
            success: true,
            token,
            user: formatUser(user),
            message: `Welcome, ${user.name}! Signed in with Google.`,
        });
    } catch (err) {
        console.error("[UserAuth] Google auth error:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to authenticate with Google.",
        });
    }
};

/**
 * GET /api/user/me
 * Returns currently authenticated user
 */
const getMe = async (req, res) => {
    return res.json({
        success: true,
        user: formatUser(req.user),
    });
};

module.exports = {
    signup,
    login,
    googleAuth,
    getMe,
};
