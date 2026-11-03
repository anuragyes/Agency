// ─────────────────────────────────────────────────────────────
// youtubePostController.js — YouTube Post Studio Controller
// Manages YouTube posts, AI drafting, revisions, media uploads (MP4 & Thumbnails),
// instant publishing, and automated scheduling.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const YouTubePost = require("../models/YouTubePost.js");
const Product = require("../models/Product.js");
const { generateYouTubePost } = require("../ai/marketResearch/platforms/youtube/YouTubePostAgent.js");
const { publishToYouTube } = require("../services/youtubePublishService.js");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "youtube");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = {
    "video/mp4": { ext: "mp4", type: "video" },
    "video/quicktime": { ext: "mov", type: "video" },
    "image/jpeg": { ext: "jpg", type: "image" },
    "image/png": { ext: "png", type: "image" },
    "image/webp": { ext: "webp", type: "image" },
};

const fail = (res, status, message, extra = {}) =>
    res.status(status).json({ success: false, message, ...extra });

/**
 * POST /api/youtube/posts/generate
 * AI drafts a YouTube video or Short package from a brief/prompt.
 */
const generate = async (req, res, next) => {
    try {
        const { productId, brief, contentType = "short", userPrompt = "" } = req.body;
        const userId = req.user?._id;

        let productProfile = null;
        if (productId && mongoose.isValidObjectId(productId)) {
            const prod = await Product.findById(productId).lean();
            if (prod) productProfile = prod.aiProfile || prod;
        }

        const { data: content, usage } = await generateYouTubePost({
            brief,
            productProfile,
            contentType,
            userPrompt,
        });

        const postDoc = await YouTubePost.create({
            userId,
            productId: productId && mongoose.isValidObjectId(productId) ? productId : undefined,
            productProfile,
            brief,
            contentType,
            status: "draft",
            content,
            revisions: userPrompt ? [{ by: "user", prompt: userPrompt }] : [],
        });

        return res.json({
            success: true,
            data: postDoc,
            usage,
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * GET /api/youtube/posts?productId=...
 */
const listPosts = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const { productId, status } = req.query;

        const filter = {};
        if (userId) filter.userId = userId;
        if (productId && mongoose.isValidObjectId(productId)) filter.productId = productId;
        if (status) filter.status = status;

        const posts = await YouTubePost.find(filter)
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();

        return res.json({ success: true, data: posts });
    } catch (err) {
        return next(err);
    }
};

/**
 * GET /api/youtube/posts/:id
 */
const getPost = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const post = await YouTubePost.findById(id).lean();
        if (!post) return fail(res, 404, "Post not found");

        return res.json({ success: true, data: post });
    } catch (err) {
        return next(err);
    }
};

/**
 * PATCH /api/youtube/posts/:id
 * Manual content edits, video assignment, or thumbnail updates.
 */
const updatePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content, video, thumbnail, contentType } = req.body;

        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const updateData = {};
        if (content) updateData.content = content;
        if (video) updateData.video = video;
        if (thumbnail) updateData.thumbnail = thumbnail;
        if (contentType) updateData.contentType = contentType;

        const updated = await YouTubePost.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();

        if (!updated) return fail(res, 404, "Post not found");

        return res.json({ success: true, data: updated });
    } catch (err) {
        return next(err);
    }
};

/**
 * POST /api/youtube/posts/:id/revise
 * AI modifies post title, hook, or description based on user prompt.
 */
const revisePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { prompt: userPrompt } = req.body;

        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");
        if (!userPrompt || !userPrompt.trim()) return fail(res, 400, "Revision prompt is required");

        const post = await YouTubePost.findById(id);
        if (!post) return fail(res, 404, "Post not found");

        const { data: nextContent } = await generateYouTubePost({
            brief: post.brief,
            productProfile: post.productProfile,
            contentType: post.contentType,
            userPrompt,
            previousContent: post.content,
        });

        post.content = { ...post.content, ...nextContent };
        post.revisions.push({ by: "ai", prompt: userPrompt });
        await post.save();

        return res.json({ success: true, data: post });
    } catch (err) {
        return next(err);
    }
};

/**
 * POST /api/youtube/media
 * Uploads a video file (.mp4 / .mov) or thumbnail image (.jpg / .png).
 */
const uploadMedia = async (req, res, next) => {
    try {
        const mime = req.headers["content-type"]?.split(";")[0]?.trim();
        const info = ALLOWED_MIME[mime];
        if (!info) {
            return fail(
                res,
                415,
                `Unsupported media type "${mime}". Allowed: MP4, MOV, JPEG, PNG, WEBP`
            );
        }

        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
            return fail(res, 400, "Empty upload body. Send raw binary data.");
        }

        const hash = crypto.randomBytes(16).toString("hex");
        const filename = `${info.type}_${hash}.${info.ext}`;
        const filePath = path.join(UPLOAD_DIR, filename);

        await fs.promises.writeFile(filePath, buf);

        const baseUrl = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
        const url = `${baseUrl}/uploads/youtube/${filename}`;

        return res.json({
            success: true,
            data: {
                type: info.type,
                url,
                filename,
                mimeType: mime,
                size: buf.length,
            },
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * POST /api/youtube/posts/:id/approve
 */
const approvePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const post = await YouTubePost.findById(id);
        if (!post) return fail(res, 404, "Post not found");

        if (!post.video?.url) {
            return fail(res, 400, "Please upload an MP4 or MOV video file before approving.");
        }

        post.status = "approved";
        await post.save();

        return res.json({ success: true, data: post });
    } catch (err) {
        return next(err);
    }
};

/**
 * POST /api/youtube/posts/:id/publish
 */
const publishPost = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const post = await YouTubePost.findById(id);
        if (!post) return fail(res, 404, "Post not found");

        if (!post.video?.url) {
            return fail(res, 400, "Cannot publish: No video file attached to this post.");
        }

        post.status = "publishing";
        await post.save();

        const result = await publishToYouTube(post);

        if (!result.ok) {
            post.status = "failed";
            post.youtube = { ...post.youtube, error: result.error };
            await post.save();
            return fail(res, 500, `Failed to publish to YouTube: ${result.error}`);
        }

        post.status = "published";
        post.youtube = {
            videoId: result.videoId,
            videoUrl: result.videoUrl,
            publishedAt: new Date(),
            rawResponse: result.rawResponse,
        };
        await post.save();

        return res.json({
            success: true,
            message: "Video published to YouTube successfully!",
            data: post,
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * POST /api/youtube/posts/:id/schedule
 */
const schedulePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { scheduledAt } = req.body;

        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const at = new Date(scheduledAt);
        if (isNaN(at.getTime()) || at <= new Date()) {
            return fail(res, 400, "Please provide a valid future date and time for scheduling.");
        }

        const post = await YouTubePost.findById(id);
        if (!post) return fail(res, 404, "Post not found");

        if (!post.video?.url) {
            return fail(res, 400, "Please upload a video file before scheduling.");
        }

        post.status = "scheduled";
        post.scheduledAt = at;
        await post.save();

        return res.json({
            success: true,
            message: `Video scheduled for ${at.toLocaleString()}`,
            data: post,
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * DELETE /api/youtube/posts/:id/schedule
 */
const cancelSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid post ID");

        const post = await YouTubePost.findById(id);
        if (!post) return fail(res, 404, "Post not found");

        post.status = "approved";
        post.scheduledAt = undefined;
        await post.save();

        return res.json({ success: true, message: "Schedule cancelled", data: post });
    } catch (err) {
        return next(err);
    }
};

/**
 * Background scheduler helper: called by postScheduler.js when scheduledAt arrives.
 */
const publishScheduled = async (doc) => {
    try {
        const r = await publishToYouTube(doc);
        if (!r.ok) {
            await YouTubePost.updateOne(
                { _id: doc._id },
                { $set: { status: "failed", "youtube.error": r.error } }
            );
            return { ok: false, error: r.error };
        }

        await YouTubePost.updateOne(
            { _id: doc._id },
            {
                $set: {
                    status: "published",
                    youtube: {
                        videoId: r.videoId,
                        videoUrl: r.videoUrl,
                        publishedAt: new Date(),
                    },
                },
            }
        );

        return { ok: true, permalink: r.videoUrl };
    } catch (err) {
        await YouTubePost.updateOne(
            { _id: doc._id },
            { $set: { status: "failed", "youtube.error": err.message } }
        );
        return { ok: false, error: err.message };
    }
};

const { createYouTubeThumbnail, THUMBNAIL_ARCHETYPES } = require("../services/imageGen/youtubeThumbnailService.js");

/**
 * POST /api/youtube/thumbnails/generate
 */
const generateThumbnail = async (req, res, next) => {
    try {
        const { postId, productId, prompt, videoTitle, archetype, overlayText, textColor, aspectRatio, position } = req.body;
        const result = await createYouTubeThumbnail({
            postId,
            productId,
            prompt,
            videoTitle,
            archetype,
            overlayText,
            textColor,
            aspectRatio,
            position,
        });

        return res.json({
            success: true,
            data: result,
            message: "YouTube AI thumbnail generated successfully!",
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/youtube/thumbnails/archetypes
 */
const getThumbnailArchetypes = (req, res) => {
    return res.json({
        success: true,
        data: THUMBNAIL_ARCHETYPES,
    });
};

module.exports = {
    generate,
    listPosts,
    getPost,
    updatePost,
    revisePost,
    uploadMedia,
    approvePost,
    publishPost,
    schedulePost,
    cancelSchedule,
    publishScheduled,
    generateThumbnail,
    getThumbnailArchetypes,
};

