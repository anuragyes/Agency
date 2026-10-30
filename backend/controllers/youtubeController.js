// ─────────────────────────────────────────────────────────────
// youtubeController.js — YouTube Channel Connection & Overview
// Powered by official Google YouTube Data API v3
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const SocialAccount = require("../models/SocialAccount.js");
const youtubeProvider = require("../services/competitors/providers/youtube.js");

const sendError = (res, next, err) =>
    err.statusCode ? res.status(err.statusCode).json({ success: false, message: err.message }) : next(err);

/**
 * GET /api/youtube/test
 * Checks whether YOUTUBE_API_KEY is configured.
 */
const testConnection = async (req, res, next) => {
    try {
        const key = process.env.YOUTUBE_API_KEY;
        if (!key) {
            return res.status(400).json({
                success: false,
                message: "YOUTUBE_API_KEY is missing in backend/.env",
            });
        }
        return res.json({ success: true, message: "YouTube Data API v3 is configured" });
    } catch (err) {
        return sendError(res, next, err);
    }
};

/**
 * GET /api/youtube/account
 * Returns the authenticated user's connected YouTube channel details, stats, and recent videos.
 */
const getAccount = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const { productId } = req.query;

        let acc = null;
        if (userId) {
            const filter = { userId, platform: "youtube", status: "connected" };
            if (productId && mongoose.isValidObjectId(productId)) {
                filter.productId = productId;
            }
            acc = await SocialAccount.findOne(filter).sort({ updatedAt: -1 }).lean();

            // If not found for specific productId, search user's global accounts
            if (!acc && productId) {
                acc = await SocialAccount.findOne({ userId, platform: "youtube", status: "connected" })
                    .sort({ updatedAt: -1 })
                    .lean();
            }
        }

        // Single-tenant local dev fallback to .env if configured
        const channelRef = acc?.accountId || acc?.username || process.env.YOUTUBE_CHANNEL_HANDLE || process.env.YOUTUBE_CHANNEL_ID;

        if (!channelRef) {
            return res.json({
                success: true,
                connected: false,
                data: null,
                message: "No YouTube channel connected yet.",
            });
        }

        const channelData = await youtubeProvider.fetchAccount(channelRef);
        return res.json({
            success: true,
            connected: true,
            data: channelData,
            account: acc
                ? {
                    _id: acc._id,
                    name: acc.name,
                    username: acc.username,
                    accountId: acc.accountId,
                    status: acc.status,
                }
                : null,
        });
    } catch (err) {
        return sendError(res, next, err);
    }
};

/**
 * POST /api/youtube/connect
 * Connects a YouTube channel for the user by handle, URL, or channel ID.
 */
const connectChannel = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const { channelQuery, productId } = req.body;

        if (!channelQuery || !String(channelQuery).trim()) {
            return res.status(400).json({
                success: false,
                message: "Please enter a YouTube channel handle, URL, or channel ID (e.g. @mkbhd).",
            });
        }

        // Verify channel and fetch live data via YouTube Data API v3
        const channelData = await youtubeProvider.fetchAccount(channelQuery.trim());
        if (!channelData?.profile?.id) {
            return res.status(404).json({
                success: false,
                message: "YouTube channel not found. Please verify the handle or URL.",
            });
        }

        const profile = channelData.profile;
        const stats = channelData.stats || {};

        let savedAccount = null;
        if (userId) {
            const updateDoc = {
                userId,
                platform: "youtube",
                accountId: profile.id,
                username: profile.username || profile.id,
                name: profile.name || profile.username,
                profilePictureUrl: profile.profilePictureUrl || null,
                accessToken: process.env.YOUTUBE_API_KEY || "API_KEY",
                metadata: {
                    subscribers: profile.followers,
                    mediaCount: profile.mediaCount,
                    totalViews: profile.totalViews,
                    engagementRate: stats.engagementRate,
                },
                status: "connected",
            };

            if (productId && mongoose.isValidObjectId(productId)) {
                updateDoc.productId = productId;
            }

            savedAccount = await SocialAccount.findOneAndUpdate(
                { userId, platform: "youtube" },
                updateDoc,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();
        }

        return res.json({
            success: true,
            message: `Connected YouTube channel "${profile.name}" successfully!`,
            data: channelData,
            account: savedAccount,
        });
    } catch (err) {
        return sendError(res, next, err);
    }
};

/**
 * POST /api/youtube/disconnect
 * Disconnects the user's connected YouTube channel.
 */
const disconnectChannel = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const { productId } = req.body;

        if (userId) {
            const filter = { userId, platform: "youtube" };
            if (productId && mongoose.isValidObjectId(productId)) {
                filter.productId = productId;
            }
            await SocialAccount.updateMany(filter, { status: "revoked" });
        }

        return res.json({
            success: true,
            message: "YouTube channel disconnected successfully",
        });
    } catch (err) {
        return sendError(res, next, err);
    }
};

module.exports = {
    testConnection,
    getAccount,
    connectChannel,
    disconnectChannel,
};
