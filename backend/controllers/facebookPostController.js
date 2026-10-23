// ─────────────────────────────────────────────────────────────
// facebookPostController.js — Facebook Post Studio (same flow as Instagram)
//   POST   /api/facebook/brief/research        Studio step 5: research your Page for the brief (real data, no LLM)
//   POST   /api/facebook/posts/generate        AI writes a text / photo / album / reel post
//   GET    /api/facebook/posts?productId=      list drafts + published
//   GET    /api/facebook/posts/:id             one post
//   PATCH  /api/facebook/posts/:id             manual edits (content / media)
//   POST   /api/facebook/posts/:id/revise      AI changes the post using the user's prompt
//   POST   /api/facebook/posts/:id/approve     approve -> "Can I post it to your Page?"
//   POST   /api/facebook/posts/:id/publish     { confirm: true, placement: "feed" | "story" } -> live on the Page
//   POST   /api/facebook/posts/:id/schedule    { scheduledAt, placement } -> goes live by itself at that time
//   DELETE /api/facebook/posts/:id/schedule    cancel the schedule (back to approved)
//   POST   /api/facebook/media                 upload JPEG / PNG / MP4 / MOV (raw body) -> public url
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { prepareMediaForPublish } = require("../services/publicMedia.js");
const cloudStorage = require("../services/cloudStorage.js");

const Product = require("../models/Product.js");
const FacebookPost = require("../models/FacebookPost.js");
const generateFacebookPost = require("../ai/marketResearch/platforms/facebook/FacebookPostAgent.js");
const researchFacebookFromBrief = require("../ai/marketResearch/platforms/facebook/FacebookBriefResearch.js");
const { normalizeBrief } = require("../ai/contentBrief/ContentBriefAgent.js");
const {
    normalizeFacebookPost,
    validateFacebookPost,
    buildFacebookMessage,
    facebookFormat,
    cleanText,
    CONTENT_TYPES,
} = require("../ai/marketResearch/platforms/facebook/FacebookPostValidator.js");
const { publishToFacebook, publishStoryToFacebook, checkFacebookMedia, checkFacebookStoryMedia } = require("../services/facebookPublishService.js");
const { getAccountCredentials } = require("../services/tokenService.js");
const { getPastPostPerformanceLearnings } = require("../services/postPerformanceLearningsService.js");

const PLACEMENTS = ["feed", "story"];
const TYPE_LABEL = { text: "text post", image: "photo post", carousel: "photo album", reel: "reel" };
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "facebook");
const ALLOWED_MIME = {
    "image/jpeg": { ext: "jpg", type: "image" },
    "image/png": { ext: "png", type: "image" },
    "video/mp4": { ext: "mp4", type: "video" },
    "video/quicktime": { ext: "mov", type: "video" },
};
const LOCAL_URL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const placementOf = (body) => (PLACEMENTS.includes(body?.placement) ? body.placement : "feed");

/** What the frontend shows: the post + the exact text that will be posted */
const view = (doc) => {
    const p = doc.toObject ? doc.toObject() : doc;
    if (p.content) p.content = { ...p.content, caption: cleanText(p.content.caption), hook: cleanText(p.content.hook) };
    const finalCaption = buildFacebookMessage(p.content);
    return { ...p, platform: "facebook", finalCaption, captionLength: finalCaption.length };
};

const findPost = async (id) => (mongoose.isValidObjectId(id) ? FacebookPost.findById(id) : null);

/** Our own /uploads/ files got a localhost url while PUBLIC_BASE_URL was not set -> point them at it now */
const refreshMediaUrls = (doc) => {
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    if (!base) return false;
    let changed = false;
    doc.media = (doc.media || []).map((m) => {
        const plain = m.toObject ? m.toObject() : m;
        const i = String(plain.url).search(/\/uploads\/(facebook|instagram|generated)\//);
        if (plain.source === "upload" && i !== -1 && !plain.url.startsWith(base)) {
            changed = true;
            return { ...plain, url: base + plain.url.slice(i) };
        }
        return plain;
    });
    if (changed) doc.markModified("media");
    return changed;
};

const mediaBlocker = (doc, placement) => {
    const problem = placement === "story" ? checkFacebookStoryMedia(doc.media) : checkFacebookMedia(doc.contentType, doc.media);
    if (!problem) return null;
    return { message: problem, fix: /localhost/i.test(problem) ? "public_url" : "media" };
};

/** product profile from Mongo (optional in the Studio flow) */
const loadProfile = async (productId, profileInBody, brief) => {
    if (profileInBody && typeof profileInBody === "object") return { productProfile: profileInBody };
    if (productId) {
        if (!mongoose.isValidObjectId(productId)) return { error: [400, "Invalid productId"] };
        const product = await Product.findById(productId).lean();
        if (product?.aiProfile) return { productProfile: product.aiProfile };
        if (!brief) return { error: [404, "Product not found"] };
    }
    if (brief) return { productProfile: { name: brief?.product?.name || "" } };
    return { error: [400, "Send productId, productProfile or brief"] };
};

const cleanBrief = (brief, productProfile) => {
    const b = brief.product ? { ...brief, productName: brief.product.name } : { ...brief };
    return normalizeBrief(b, { platform: "facebook", productProfile });
};

const hasResearch = (r) => r && typeof r === "object" && Array.isArray(r.hashtags);

// ───────── POST /brief/research ─────────
const researchFromBrief = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, brief } = req.body || {};
        if (!brief || typeof brief !== "object") return fail(res, 400, "Send the JSON from step 3 (brief)");
        if (brief.platform && brief.platform !== "facebook") return fail(res, 400, `This is the Facebook researcher — the JSON is for ${brief.platform}`);
        const { productProfile } = await loadProfile(productId, profileInBody, brief);

        const research = await researchFacebookFromBrief({ brief: cleanBrief(brief, productProfile || {}) });
        return res.json({
            success: true,
            data: research,
            usage: { promptTokens: 0, completionTokens: 0 }, // Graph API only, no LLM
            assistant: {
                message: research.mediaAnalyzed
                    ? `Read ${research.mediaAnalyzed} posts from your Facebook Page${research.topPosts?.length ? " and found what works best" : ""}. Ready to write the post.`
                    : "Your Facebook Page data isn't available right now — I'll still write the post from your brief.",
            },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /posts/generate ─────────
const generatePost = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, brief: briefInBody, research: researchInBody, userPrompt = "" } = req.body || {};
        const briefMode = briefInBody && typeof briefInBody === "object";
        const contentType = facebookFormat(req.body?.contentType || briefInBody?.formatHint || "image");

        const { productProfile, error } = await loadProfile(productId, profileInBody, briefMode ? briefInBody : null);
        if (error) return fail(res, ...error);

        const stats = {};
        const brief = briefMode ? cleanBrief(briefInBody, productProfile) : null;
        const research = hasResearch(researchInBody) ? researchInBody : brief ? await researchFacebookFromBrief({ brief }) : null;

        // Closed-loop past performance intelligence (runs 100% behind the scenes)
        const performanceLearnings = await getPastPostPerformanceLearnings({ productId, platform: "facebook" });

        const content = await generateFacebookPost({ brief, productProfile, research, contentType, userPrompt, stats, performanceLearnings });

        const doc = await FacebookPost.create({
            userId: req.user?._id || undefined,
            productId: mongoose.isValidObjectId(productId) ? productId : undefined,
            productProfile,
            brief: brief || undefined,
            research: research || undefined,
            contentType,
            content,
            performanceLearnings: performanceLearnings?.analyzed ? performanceLearnings : undefined,
            revisions: [{ by: "ai", prompt: userPrompt || (brief ? `first draft: ${brief.optimizedPrompt}`.slice(0, 300) : "first draft") }],
        });
        console.log(`[FacebookPost] ${brief ? "brief" : "profile"} ${contentType} prompt=${stats.promptTokens}t out=${stats.completionTokens}t`);

        return res.status(201).json({
            success: true,
            data: view(doc),
            usage: stats,
            assistant: {
                message: `Your Facebook ${TYPE_LABEL[contentType]} is ready for review. Edit anything, or tell me what to change.`,
                actions: ["edit", "revise", "approve"],
            },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── GET /posts ─────────
const listPosts = async (req, res, next) => {
    try {
        const filter = {};

        // Multi-tenant isolation: If user is authenticated, only show their posts
        if (req.user?._id) {
            const Product = require("../models/Product.js");
            const userProducts = await Product.find({ userId: req.user._id }).select("_id").lean();
            const userProductIds = userProducts.map((p) => p._id);

            if (req.query.productId && mongoose.isValidObjectId(req.query.productId)) {
                const requestedId = new mongoose.Types.ObjectId(req.query.productId);
                const ownsProduct = userProductIds.some((id) => id.equals(requestedId));
                if (!ownsProduct) {
                    return res.json({ success: true, data: [] });
                }
                filter.productId = requestedId;
            } else {
                filter.$or = [
                    { userId: req.user._id },
                    { productId: { $in: userProductIds } },
                ];
            }
        } else if (req.query.productId && mongoose.isValidObjectId(req.query.productId)) {
            filter.productId = req.query.productId;
        }

        if (req.query.status) filter.status = String(req.query.status);
        const posts = await FacebookPost.find(filter).select("-research -productProfile").sort({ updatedAt: -1 }).limit(50);
        return res.json({ success: true, data: posts.map(view) });
    } catch (err) {
        next(err);
    }
};

// ───────── GET /posts/:id ─────────
const getPost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        return res.json({ success: true, data: view(doc) });
    } catch (err) {
        next(err);
    }
};

// ───────── PATCH /posts/:id ─────────
const updatePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);

        const { content, media } = req.body || {};
        if (content) {
            const merged = normalizeFacebookPost({ ...doc.content, ...content }, doc.contentType);
            const { valid, errors } = validateFacebookPost(merged);
            if (!valid) return fail(res, 400, errors.join(", "), { errors });
            doc.content = merged;
            doc.markModified("content");
            doc.revisions.push({ by: "user", prompt: "manual edit" });
        }
        if (Array.isArray(media)) {
            doc.media = media
                .filter((m) => m && m.url && ["image", "video"].includes(m.type))
                .slice(0, 10)
                .map((m) => ({ type: m.type, url: String(m.url).trim(), mimeType: m.mimeType, source: m.source || "url" }));
        }
        // any change after approval needs a new approval (a scheduled post keeps its date — approving again re-schedules it)
        if (doc.status === "approved" || doc.status === "failed" || doc.status === "scheduled") doc.status = "draft";
        await doc.save();
        return res.json({ success: true, data: view(doc) });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /posts/:id/revise ─────────
const revisePost = async (req, res, next) => {
    try {
        const { userPrompt, contentType } = req.body || {};
        if (!userPrompt || !String(userPrompt).trim()) return fail(res, 400, "Tell the AI what to change (userPrompt)");
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);

        const nextType = CONTENT_TYPES.includes(contentType) ? contentType : doc.contentType;
        const content = await generateFacebookPost({
            brief: doc.brief,
            productProfile: doc.productProfile,
            research: doc.research,
            contentType: nextType,
            userPrompt: String(userPrompt).trim(),
            previousContent: doc.content,
        });
        // hashtags the user picked survive an AI rewrite
        if (doc.content?.hashtagSource) {
            content.hashtags = doc.content.hashtags || [];
            content.hashtagSource = doc.content.hashtagSource;
        }
        // the link the user set stays unless the AI was asked about it
        if (doc.content?.link && !content.link) content.link = doc.content.link;

        doc.contentType = nextType;
        doc.content = content;
        doc.markModified("content");
        doc.status = "draft";
        doc.revisions.push({ by: "ai", prompt: String(userPrompt).trim() });
        await doc.save();
        return res.json({
            success: true,
            data: view(doc),
            assistant: { message: "Done — I updated the post. Review it again and approve when you're happy.", actions: ["edit", "revise", "approve"] },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /posts/:id/approve ─────────
const approvePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (doc.status === "published") return fail(res, 409, "Post is already published");

        const { valid, errors } = validateFacebookPost(doc.content);
        if (!valid) return fail(res, 400, errors.join(", "), { errors });

        await prepareMediaForPublish(doc); // Cloudinary set up -> local files become public https links
        refreshMediaUrls(doc);
        doc.status = "approved";
        // it already had a date & time (scheduled, then edited) -> approving again puts it back on the schedule
        const keepSchedule = isUpcoming(doc.scheduledAt) && !mediaBlocker(doc, doc.scheduledPlacement || "feed");
        if (keepSchedule) doc.status = "scheduled";
        await doc.save();

        const placement = placementOf(req.body);
        const blocker = mediaBlocker(doc, placement);
        const where = placement === "story" ? "your Facebook Page Story" : "your Facebook Page";
        return res.json({
            success: true,
            data: view(doc),
            assistant: blocker
                ? {
                    message: `Approved! Before I can post it: ${blocker.message}`,
                    actions: blocker.fix === "public_url" ? ["set_public_url"] : ["add_media"],
                    needsMedia: true,
                    fix: blocker.fix,
                    canStory: placement === "feed" && blocker.fix === "media" && !checkFacebookStoryMedia(doc.media),
                    placement,
                }
                : keepSchedule
                    ? { message: "Approved! It stays scheduled — keep the date & time, change it, or post it now.", actions: ["schedule", "publish", "not_now"], askToPublish: true, placement: doc.scheduledPlacement || placement, scheduledAt: doc.scheduledAt }
                    : { message: `Approved! Can I post this ${placement === "story" ? "story" : TYPE_LABEL[doc.contentType]} to ${where} now — or schedule it for later?`, actions: ["publish", "schedule", "not_now"], askToPublish: true, placement },
        });
    } catch (err) {
        next(err);
    }
};

/** Post it to the Page right now -> Graph API result. Used by "Yes, upload" AND by the scheduler. Media already checked. */
const publishNow = async (doc, placement) => {
    doc.status = "publishing";
    doc.set("facebook.error", undefined);
    doc.set("facebook.placement", placement);
    await doc.save();

    const creds = await getAccountCredentials({
        productId: doc.productId,
        userId: doc.userId,
        platform: "facebook",
    });

    const result = placement === "story"
        ? await publishStoryToFacebook({
            media: doc.media,
            customToken: creds?.accessToken,
            customPageId: creds?.accountId,
        })
        : await publishToFacebook({
            contentType: doc.contentType,
            message: buildFacebookMessage(doc.content),
            media: doc.media,
            link: doc.content?.link,
            customToken: creds?.accessToken,
            customPageId: creds?.accountId,
        });

    doc.status = "published";
    doc.facebook = { postId: result.postId, mediaId: result.mediaId, permalink: result.permalink, placement, processing: !!result.processing, publishedAt: new Date() };
    await doc.save();
    return result;
};

// ───────── POST /posts/:id/publish ─────────
const publishPost = async (req, res, next) => {
    const doc = await findPost(req.params.id).catch(() => null);
    if (!doc) return fail(res, 404, "Post not found");
    try {
        if (req.body?.confirm !== true) return fail(res, 400, "User must confirm the upload ({ confirm: true })");
        if (doc.status === "published") return fail(res, 409, "Post is already published", { data: view(doc) });
        if (doc.status !== "approved" && doc.status !== "failed" && doc.status !== "scheduled" && doc.status !== "draft") return fail(res, 409, "Approve the post first, then confirm the upload");

        const placement = placementOf(req.body);
        await prepareMediaForPublish(doc); // Cloudinary set up -> local files become public https links
        refreshMediaUrls(doc);
        const blocker = mediaBlocker(doc, placement);
        if (blocker) return fail(res, 400, blocker.message, { fix: blocker.fix });

        // scheduled post, "publish now" instead -> take it off the schedule first (the scheduler may not grab it too)
        if (doc.status === "scheduled" && !(await claimScheduled(FacebookPost, doc))) {
            return fail(res, 409, "The scheduler is publishing this post right now — refresh in a moment");
        }

        const result = await publishNow(doc, placement);

        const page = result.pageName || "your Page";
        return res.json({
            success: true,
            data: view(doc),
            assistant: {
                message: placement === "story"
                    ? `Posted to ${page}'s Story 🎉 (visible for 24 hours)`
                    : result.processing
                        ? `Sent to ${page} 🎉 Facebook is still processing the reel — it goes live by itself in a few minutes.`
                        : `Published to ${page} 🎉`,
                permalink: result.permalink,
                placement,
            },
        });
    } catch (err) {
        doc.status = "failed";
        doc.set("facebook.error", err.message);
        await doc.save().catch(() => { });
        if (err.statusCode) return fail(res, err.statusCode, err.message, { data: view(doc) });
        next(err);
    }
};

// ───────── "Schedule for later" ─────────
const MIN_LEAD_MS = 60 * 1000;                  // at least 1 minute from now
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // at most 1 year ahead
const isUpcoming = (at) => !!at && new Date(at).getTime() > Date.now();

/** scheduled -> approved, only if still scheduled (atomic, so the scheduler and "publish now" never both post it) */
const claimScheduled = async (Model, doc) => {
    const claimed = await Model.findOneAndUpdate({ _id: doc._id, status: "scheduled" }, { $set: { status: "approved" } });
    if (claimed) doc.status = "approved";
    return !!claimed;
};

// ───────── POST /posts/:id/schedule  ({ scheduledAt: ISO date, placement: "feed" | "story" }) ─────────
const schedulePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);
        if (!["approved", "scheduled", "failed", "draft"].includes(doc.status)) return fail(res, 409, "Approve the post first, then pick a date & time");

        const at = new Date(req.body?.scheduledAt);
        if (!req.body?.scheduledAt || Number.isNaN(at.getTime())) return fail(res, 400, "Pick a valid date and time (scheduledAt)");
        if (at.getTime() < Date.now() + MIN_LEAD_MS) return fail(res, 400, "Pick a time at least 1 minute from now");
        if (at.getTime() > Date.now() + MAX_AHEAD_MS) return fail(res, 400, "Pick a date within the next 12 months");

        const placement = placementOf(req.body);
        await prepareMediaForPublish(doc); // Cloudinary set up -> local files become public https links
        refreshMediaUrls(doc);
        const blocker = mediaBlocker(doc, placement);
        if (blocker) return fail(res, 400, blocker.message, { fix: blocker.fix });

        doc.status = "scheduled";
        doc.scheduledAt = at;
        doc.scheduledPlacement = placement;
        doc.set("facebook.error", undefined);
        await doc.save();

        return res.json({
            success: true,
            data: view(doc),
            assistant: { message: "Scheduled! I'll post it by itself at that time.", scheduled: true, scheduledAt: at, placement },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── DELETE /posts/:id/schedule ─────────
const unschedulePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);
        if (doc.status === "scheduled" && !(await claimScheduled(FacebookPost, doc))) {
            return fail(res, 409, "The scheduler is publishing this post right now — refresh in a moment");
        }
        doc.scheduledAt = undefined;
        doc.scheduledPlacement = undefined;
        await doc.save();
        return res.json({ success: true, data: view(doc) });
    } catch (err) {
        next(err);
    }
};

/** services/postScheduler.js calls this when the time has come. The doc is already claimed (status "publishing"). */
const publishScheduled = async (doc) => {
    const placement = doc.scheduledPlacement || "feed";
    try {
        await prepareMediaForPublish(doc);
        refreshMediaUrls(doc);
        const blocker = mediaBlocker(doc, placement);
        if (blocker) throw new Error(blocker.message);
        const result = await publishNow(doc, placement);
        return { ok: true, permalink: result.permalink };
    } catch (err) {
        doc.status = "failed";
        doc.set("facebook.error", `Scheduled publish failed: ${err.message}`);
        await doc.save().catch(() => { });
        return { ok: false, error: err.message };
    }
};

// ───────── POST /media ─────────
const uploadMedia = async (req, res, next) => {
    try {
        const mime = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const info = ALLOWED_MIME[mime];
        if (!info) return fail(res, 415, "Use a JPEG or PNG image, or an MP4/MOV video.");
        if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, "Empty file");

        // Cloudinary set up -> permanent public https link (no ngrok, survives Render restarts)
        if (cloudStorage.isConfigured()) {
            const up = await cloudStorage.uploadBuffer(req.body, { folder: "facebook", resourceType: info.type === "video" ? "video" : "image", mimeType: mime, filename: `upload.${info.ext}` });
            return res.status(201).json({ success: true, data: { type: info.type, url: up.url, mimeType: mime, source: "upload", publicReachable: true } });
        }

        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const name = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${info.ext}`;
        await fs.promises.writeFile(path.join(UPLOAD_DIR, name), req.body);

        const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
        const url = `${base}/uploads/facebook/${name}`;
        return res.status(201).json({
            success: true,
            data: { type: info.type, url, mimeType: mime, source: "upload", publicReachable: !LOCAL_URL.test(url) },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { researchFromBrief, generatePost, listPosts, getPost, updatePost, revisePost, approvePost, publishPost, schedulePost, unschedulePost, publishScheduled, uploadMedia };
