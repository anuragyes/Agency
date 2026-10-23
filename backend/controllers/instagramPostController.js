// ─────────────────────────────────────────────────────────────
// instagramPostController.js — Instagram Post Studio
//   POST   /api/instagram/brief/research        Studio step 3: live Instagram research for a content brief (no LLM, waits for the result)
//   POST   /api/instagram/brief/research/jobs   same research as a background job -> { jobId } in ~200ms (BullMQ queue)
//   GET    /api/instagram/brief/research/jobs/:jobId   job state + per-seed progress + result when done
//   POST   /api/instagram/posts/:id/live-hashtags      refine a draft with the live research hashtags (draft -> refine)
//   POST   /api/instagram/posts/generate        AI writes a post / reel / carousel (from brief + research, or legacy research)
//   GET    /api/instagram/posts?productId=       list drafts + published
//   GET    /api/instagram/posts/:id              one post
//   PATCH  /api/instagram/posts/:id              user edits caption / hashtags / media ...
//   POST   /api/instagram/posts/:id/revise       AI changes the post using the user's prompt
//   POST   /api/instagram/posts/:id/approve      user approves -> AI asks "Can I upload it?"
//   POST   /api/instagram/posts/:id/publish      user says yes ({ confirm: true, placement: "feed" | "story" }) -> goes live
//   POST   /api/instagram/posts/:id/schedule     or: schedule it ({ scheduledAt, placement }) -> goes live by itself then
//   DELETE /api/instagram/posts/:id/schedule     cancel the schedule (back to approved)
//   POST   /api/instagram/media                  upload an image/video (raw body) -> public url
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const GRAPH_API = "https://graph.instagram.com";
const crypto = require("crypto");
const mongoose = require("mongoose");
const { prepareMediaForPublish } = require("../services/publicMedia.js");
const cloudStorage = require("../services/cloudStorage.js");

const Product = require("../models/Product.js");

const InstagramPost = require("../models/InstagramPost.js");
const generateInstagramResearch = require("../ai/marketResearch/platforms/instagram/InstagramStandaloneAgent.js");
const generateInstagramPost = require("../ai/marketResearch/platforms/instagram/InstagramPostAgent.js");
const researchInstagramFromBrief = require("../ai/marketResearch/platforms/instagram/InstagramBriefResearch.js");
const { pickLiveHashtags } = require("../ai/marketResearch/platforms/instagram/InstagramLiveHashtags.js");
const { startBriefResearchJob, getBriefResearchJob } = require("../services/researchJobService.js");
const { normalizeBrief } = require("../ai/contentBrief/ContentBriefAgent.js");
const { instagramFormat } = require("../ai/contentBrief/PlatformBriefSpecs.js");
const {
    normalizeInstagramPost,
    validateInstagramPost,
    buildFinalCaption,
    cleanText,
    CONTENT_TYPES,
} = require("../ai/marketResearch/platforms/instagram/InstagramPostValidator.js");
const { publishToInstagram, publishStoryToInstagram, checkMedia, checkStoryMedia } = require("../services/instagramPublishService.js");
const { getAccountCredentials } = require("../services/tokenService.js");
const { getPastPostPerformanceLearnings } = require("../services/postPerformanceLearningsService.js");

/** Where the user wants it: the feed (post / reel / carousel) or their Story */
const PLACEMENTS = ["feed", "story"];

/**
 * Files uploaded while PUBLIC_BASE_URL was not set got a localhost url Instagram can't download.
 * Once PUBLIC_BASE_URL is set (e.g. ngrok), point our own /uploads/ files at it — no re-upload needed.
 */
const refreshMediaUrls = (doc) => {
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    if (!base) return false;
    let changed = false;
    doc.media = (doc.media || []).map((m) => {
        const plain = m.toObject ? m.toObject() : m;
        const i = String(plain.url).search(/\/uploads\/(instagram|generated)\//); // own uploads + AI-generated ad images
        if (plain.source === "upload" && i !== -1 && !plain.url.startsWith(base)) {
            changed = true;
            return { ...plain, url: base + plain.url.slice(i) };
        }
        return plain;
    });
    if (changed) doc.markModified("media");
    return changed;
};

/** What the user must do before publishing -> { message, fix } | null  (fix: "public_url" | "media") */
const mediaBlocker = (doc, placement) => {
    const problem = placement === "story" ? checkStoryMedia(doc.media) : checkMedia(doc.contentType, doc.media);
    if (!problem) return null;
    return { message: problem, fix: /localhost/i.test(problem) ? "public_url" : "media" };
};
const placementOf = (body) => (PLACEMENTS.includes(body?.placement) ? body.placement : "feed");
const { publishInstagramStory } = require("../services/instagramService.js");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "instagram");
const ALLOWED_MIME = {
    "image/jpeg": { ext: "jpg", type: "image" },  // Instagram API accepts JPEG only for images
    "video/mp4": { ext: "mp4", type: "video" },
    "video/quicktime": { ext: "mov", type: "video" },
};

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** What the frontend shows: the post + the final caption that will be posted */
const view = (doc) => {
    const p = doc.toObject ? doc.toObject() : doc;
    // older drafts may still hold Markdown (**bold**) -> show them clean too
    if (p.content) p.content = { ...p.content, caption: cleanText(p.content.caption), hook: cleanText(p.content.hook) };
    const finalCaption = buildFinalCaption(p.content);
    return { ...p, platform: "instagram", finalCaption, captionLength: finalCaption.length };
};

const findPost = async (id) => {
    if (!mongoose.isValidObjectId(id)) return null;
    return InstagramPost.findById(id);
};

/** Accepts the raw instargramAgent response ({ success, research }) or just the research object */
const unwrapResearch = (r) => (r && typeof r === "object" ? r.research || r : null);

/** product profile from Mongo (productId) or sent directly -> { productProfile } | { error: [status, msg] } */
const loadProfile = async (productId, profileInBody) => {
    let productProfile = profileInBody;
    if (productId) {
        if (!mongoose.isValidObjectId(productId)) return { error: [400, "Invalid productId"] };
        const product = await Product.findById(productId).lean();
        if (!product) return { error: [404, "Product not found"] };
        productProfile = product.aiProfile;
    }
    if (!productProfile || typeof productProfile !== "object") return { error: [400, "Send productId or productProfile"] };
    return { productProfile };
};

/** Studio flow: the saved profile is optional -> fall back to the product name in the JSON */
const loadProfileForBrief = async (productId, brief) => {
    if (productId) {
        const r = await loadProfile(productId);
        if (r.productProfile) return r;
    }
    return { productProfile: { name: brief?.product?.name || "" } };
};

/** The JSON from step 3 -> cleaned again (never trust the client) and stamped for Instagram */
const cleanBrief = (brief, productProfile) => {
    const b = brief.product ? { ...brief, productName: brief.product.name } : { ...brief };
    return normalizeBrief(b, { platform: "instagram", productProfile });
};

// ───────── POST /brief/research  (Studio step 3) ─────────
const researchFromBrief = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, brief } = req.body || {};
        if (!brief || typeof brief !== "object") return fail(res, 400, "Send the JSON from step 3 (brief)");
        if (brief.platform && brief.platform !== "instagram") return fail(res, 400, `This is the Instagram researcher — the JSON is for ${brief.platform}`);

        const { productProfile } = profileInBody ? { productProfile: profileInBody } : await loadProfileForBrief(productId, brief);

        const research = await researchInstagramFromBrief({ brief: cleanBrief(brief, productProfile), productProfile });
        return res.json({
            success: true,
            data: research,
            usage: { promptTokens: 0, completionTokens: 0 }, // live Instagram API only, no LLM
            assistant: {
                message: research.hashtags.length
                    ? `Found ${research.hashtags.length} real hashtags from ${research.mediaAnalyzed} Instagram posts. Ready to write the post.`
                    : "Live Instagram data isn't available right now — I'll still write the post from your brief.",
            },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /brief/research/jobs  (Studio step 5, background) ─────────
// Answers at once with a jobId; the worker (npm run worker) does the research.
const startResearchJob = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, brief } = req.body || {};
        if (!brief || typeof brief !== "object") return fail(res, 400, "Send the JSON from step 3 (brief)");
        if (brief.platform && brief.platform !== "instagram") return fail(res, 400, `This is the Instagram researcher — the JSON is for ${brief.platform}`);

        const { productProfile } = profileInBody ? { productProfile: profileInBody } : await loadProfileForBrief(productId, brief);
        const job = await startBriefResearchJob({ brief: cleanBrief(brief, productProfile), productProfile });
        return res.status(202).json({
            success: true,
            data: job, // { jobId, mode: "queue" | "memory", reused }
            assistant: { message: "Researching live Instagram hashtags — you'll see each hashtag finish here." },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── GET /brief/research/jobs/:jobId ─────────
const getResearchJob = async (req, res, next) => {
    try {
        const job = await getBriefResearchJob(req.params.jobId);
        if (!job) return fail(res, 404, "Research job not found (finished jobs are kept for 24 hours)");
        return res.json({ success: true, data: job });
    } catch (err) {
        if (err.statusCode) return fail(res, err.statusCode, err.message);
        next(err);
    }
};

// ───────── POST /posts/:id/live-hashtags  { jobId } | { research } ─────────
// Draft -> refine: the draft was written from the brief while research ran; now swap in live hashtags.
const applyLiveHashtags = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (!doc.brief) return fail(res, 400, "Only Studio posts (made from a brief) can get live hashtags this way");
        if (doc.status !== "draft") return fail(res, 409, `Post is ${doc.status} — live hashtags can only be added to a draft`);

        let research = req.body?.research;
        if (req.body?.jobId) {
            const job = await getBriefResearchJob(req.body.jobId);
            if (!job) return fail(res, 404, "Research job not found");
            if (job.state !== "completed") return fail(res, 409, `Research is not finished yet (${job.state})`, { state: job.state });
            research = job.result;
        }
        if (!research || typeof research !== "object" || !Array.isArray(research.hashtags)) {
            return fail(res, 400, "Send { jobId } of a finished research job, or { research }");
        }
        // the user already changed the draft by hand -> don't overwrite their hashtags
        const userEdited = (doc.revisions || []).some((r) => r.by === "user");

        const content = { ...(doc.content.toObject ? doc.content.toObject() : doc.content) };
        const picked = userEdited ? [] : pickLiveHashtags({ draft: content.hashtags, research, brief: doc.brief, caption: content.caption });
        let message;
        if (picked.length) {
            const updated = { ...content, hashtags: picked, hashtagSource: "instagram_api" };
            if (validateInstagramPost(updated).valid) {
                doc.content = updated;
                message = `Added ${picked.length} live Instagram hashtags from ${research.mediaAnalyzed || 0} real posts.`;
            } else {
                message = "Live hashtags didn't fit the caption limit — kept the AI hashtags.";
            }
        } else {
            message = userEdited
                ? "You already edited this post, so your hashtags were kept."
                : "No live Instagram data right now — kept the AI-suggested hashtags.";
        }
        doc.instagramResearch = research;
        doc.markModified("content");
        doc.revisions.push({ by: "ai", prompt: "live Instagram hashtags (research finished)" });
        await doc.save();

        return res.json({ success: true, data: view(doc), assistant: { message } });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /posts/generate ─────────
// Studio flow : { productId, brief, research, contentType?, userPrompt? }  -> small prompt (brief + live hashtags)
// Legacy flow : { productId, instagramResearch, contentType, userPrompt }  -> full profile + research prompt
// Studio draft: { productId, brief, deferResearch: true } -> writes from the brief only (research still running);
//               then POST /posts/:id/live-hashtags swaps in the live hashtags
const generatePost = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, instagramResearch, brief: briefInBody, research: researchInBody, deferResearch = false, userPrompt = "" } = req.body || {};
        // Studio flow: the researcher picks the format from the JSON's formatHint (user doesn't choose)
        const contentType = req.body?.contentType || (briefInBody ? instagramFormat(briefInBody.formatHint) : "image");

        if (!CONTENT_TYPES.includes(contentType)) {
            return fail(res, 400, `contentType must be one of: ${CONTENT_TYPES.join(", ")}`);
        }

        // 1. product profile (fact source + saved on the post for the editor) — optional in the Studio flow
        const briefMode = briefInBody && typeof briefInBody === "object";
        const { productProfile, error } = briefMode && !profileInBody
            ? await loadProfileForBrief(productId, briefInBody)
            : await loadProfile(productId, profileInBody);
        if (error) return fail(res, ...error);

        const stats = {};
        let content, brief = null, research;

        // Closed-loop past performance intelligence (runs 100% behind the scenes)
        const performanceLearnings = await getPastPostPerformanceLearnings({ productId, platform: "instagram" });

        if (briefMode) {
            // 2a. Studio flow — the Instagram researcher works ONLY from the JSON + live research
            brief = cleanBrief(briefInBody, productProfile);
            research = researchInBody && typeof researchInBody === "object" && Array.isArray(researchInBody.hashtags)
                ? researchInBody
                : deferResearch
                    ? null   // draft first: caption/hook need only the brief; hashtags are refined when research is done
                    : await researchInstagramFromBrief({ brief, productProfile });
            content = await generateInstagramPost({ brief, research, contentType, userPrompt, stats, performanceLearnings });
        } else {
            // 2b. Legacy flow: use the instargramAgent result if sent, otherwise run the agent now
            research = unwrapResearch(instagramResearch);
            if (!research) {
                ({ research } = await generateInstagramResearch(productProfile));
            }
            content = await generateInstagramPost({ productProfile, instagramResearch: research, contentType, userPrompt, stats, performanceLearnings });
        }

        const doc = await InstagramPost.create({
            userId: req.user?._id || undefined,
            productId: mongoose.isValidObjectId(productId) ? productId : undefined,
            productProfile,
            brief: brief || undefined,
            instagramResearch: research || undefined,
            contentType,
            content,
            performanceLearnings: performanceLearnings?.analyzed ? performanceLearnings : undefined,
            revisions: [{ by: "ai", prompt: userPrompt || (brief ? `first draft: ${brief.optimizedPrompt}`.slice(0, 300) : "first draft") }],
        });
        console.log(`[InstagramPost] ${brief ? "brief" : "legacy"} ${contentType} prompt=${stats.promptTokens}t out=${stats.completionTokens}t`);

        return res.status(201).json({
            success: true,
            data: view(doc),
            usage: stats,
            assistant: {
                message: `Your Instagram ${contentType} is ready for review. Edit anything, or tell me what to change.`,
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

        if (req.query.status) filter.status = req.query.status;
        const posts = await InstagramPost.find(filter)
            .select("-instagramResearch -productProfile")
            .sort({ updatedAt: -1 })
            .limit(50);
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

// ───────── PATCH /posts/:id  (manual edits) ─────────
const updatePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);

        const { content, media, coverUrl } = req.body || {};

        if (content) {
            const merged = normalizeInstagramPost({ ...doc.content, ...content }, doc.contentType);
            const { valid, errors } = validateInstagramPost(merged);
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
        if (typeof coverUrl === "string") doc.coverUrl = coverUrl.trim();

        // any change after approval needs a new approval (a scheduled post keeps its date — approving again re-schedules it)
        if (doc.status === "approved" || doc.status === "failed" || doc.status === "scheduled") doc.status = "draft";

        await doc.save();
        return res.json({ success: true, data: view(doc) });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /posts/:id/revise  (AI edit with user prompt) ─────────
const revisePost = async (req, res, next) => {
    try {
        const { userPrompt, contentType } = req.body || {};
        if (!userPrompt || !String(userPrompt).trim()) return fail(res, 400, "Tell the AI what to change (userPrompt)");

        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);

        // user may also switch format while revising ("turn this into a reel")
        const nextType = CONTENT_TYPES.includes(contentType) ? contentType : doc.contentType;

        // posts made in the Studio flow keep using the small brief prompt
        const content = await generateInstagramPost(doc.brief
            ? {
                brief: doc.brief,
                research: doc.instagramResearch,
                contentType: nextType,
                userPrompt: String(userPrompt).trim(),
                previousContent: doc.content,
            }
            : {
                productProfile: doc.productProfile,
                instagramResearch: doc.instagramResearch,
                contentType: nextType,
                userPrompt: String(userPrompt).trim(),
                previousContent: doc.content,
            });

        // hashtags the user picked (real Instagram data / typed by hand) survive an AI rewrite
        if (doc.content?.hashtagSource && doc.content?.hashtags?.length) {
            content.hashtags = doc.content.hashtags;
            content.hashtagSource = doc.content.hashtagSource;
        }

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

        const { valid, errors } = validateInstagramPost(doc.content);
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
        const where = placement === "story" ? "your Instagram Story" : "your Instagram feed";
        return res.json({
            success: true,
            data: view(doc),
            assistant: blocker
                ? {
                    message: `Approved! Before I can upload it: ${blocker.message}`,
                    actions: blocker.fix === "public_url" ? ["set_public_url"] : ["add_media"],
                    needsMedia: true,
                    fix: blocker.fix,
                    // a carousel with 1 image can still go out as a Story
                    canStory: placement === "feed" && blocker.fix === "media" && !checkStoryMedia(doc.media),
                    placement,
                }
                : keepSchedule
                    ? { message: "Approved! It stays scheduled — keep the date & time, change it, or upload it now.", actions: ["schedule", "publish", "not_now"], askToPublish: true, placement: doc.scheduledPlacement || placement, scheduledAt: doc.scheduledAt }
                    : { message: `Approved! Can I upload this ${placement === "story" ? "story" : doc.contentType} to ${where} now — or schedule it for later?`, actions: ["publish", "schedule", "not_now"], askToPublish: true, placement },
        });
    } catch (err) {
        next(err);
    }
};

/** Post it to Instagram right now -> Graph API result. Used by "Yes, upload" AND by the scheduler. Media already checked. */
const publishNow = async (doc, placement) => {
    doc.status = "publishing";
    doc.set("instagram.error", undefined);
    doc.set("instagram.placement", placement);
    await doc.save();

    const creds = await getAccountCredentials({
        productId: doc.productId,
        userId: doc.userId,
        platform: "instagram",
    });

    // Story -> media_type=STORIES (first image/video, no caption) | Feed -> image / reel / carousel with caption
    const result = placement === "story"
        ? await publishStoryToInstagram({
            media: doc.media,
            customToken: creds?.accessToken,
            customIgUserId: creds?.accountId,
            customUsername: creds?.username,
        })
        : await publishToInstagram({
            contentType: doc.contentType,
            caption: buildFinalCaption(doc.content),
            media: doc.media,
            coverUrl: doc.coverUrl,
            customToken: creds?.accessToken,
            customIgUserId: creds?.accountId,
            customUsername: creds?.username,
        });

    doc.status = "published";
    doc.instagram = { mediaId: result.mediaId, containerId: result.containerId, permalink: result.permalink, placement, publishedAt: new Date() };
    await doc.save();
    return result;
};

// ───────── POST /posts/:id/publish  ({ confirm: true }) ─────────
const publishPost = async (req, res, next) => {
    const doc = await findPost(req.params.id).catch(() => null);
    if (!doc) return fail(res, 404, "Post not found");

    try {
        if (req.body?.confirm !== true) return fail(res, 400, "User must confirm the upload ({ confirm: true })");
        if (doc.status === "published") return fail(res, 409, "Post is already published", { data: view(doc) });
        if (doc.status !== "approved" && doc.status !== "failed" && doc.status !== "scheduled" && doc.status !== "draft") {
            return fail(res, 409, "Approve the post first, then confirm the upload");
        }

        const placement = placementOf(req.body);
        await prepareMediaForPublish(doc); // Cloudinary set up -> local files become public https links
        refreshMediaUrls(doc);
        const blocker = mediaBlocker(doc, placement);
        if (blocker) return fail(res, 400, blocker.message, { fix: blocker.fix });

        // scheduled post, "publish now" instead -> take it off the schedule first (the scheduler may not grab it too)
        if (doc.status === "scheduled" && !(await claimScheduled(InstagramPost, doc))) {
            return fail(res, 409, "The scheduler is publishing this post right now — refresh in a moment");
        }

        const result = await publishNow(doc, placement);

        return res.json({
            success: true,
            data: view(doc),
            assistant: {
                message: placement === "story"
                    ? `Posted to @${result.username || "your account"}'s Story 🎉 (visible for 24 hours)`
                    : `Published to @${result.username || "your account"} 🎉`,
                permalink: result.permalink,
                placement,
            },
        });
    } catch (err) {
        doc.status = "failed";
        doc.set("instagram.error", err.message);
        await doc.save().catch(() => { });
        return fail(res, err.statusCode || 400, err.message, { data: view(doc) });
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
// Approved post -> status "scheduled". Calling it again just moves the date & time.
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
        doc.set("instagram.error", undefined);
        await doc.save();

        return res.json({
            success: true,
            data: view(doc),
            assistant: { message: "Scheduled! I'll publish it by itself at that time.", scheduled: true, scheduledAt: at, placement },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── DELETE /posts/:id/schedule  (cancel: scheduled -> approved, keeps the post) ─────────
const unschedulePost = async (req, res, next) => {
    try {
        const doc = await findPost(req.params.id);
        if (!doc) return fail(res, 404, "Post not found");
        if (["publishing", "published"].includes(doc.status)) return fail(res, 409, `Post is already ${doc.status}`);
        if (doc.status === "scheduled" && !(await claimScheduled(InstagramPost, doc))) {
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
        doc.set("instagram.error", `Scheduled publish failed: ${err.message}`);
        await doc.save().catch(() => { });
        return { ok: false, error: err.message };
    }
};

// ───────── POST /media  (raw image/video body) ─────────
const uploadMedia = async (req, res, next) => {
    try {
        const mime = (req.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const info = ALLOWED_MIME[mime];
        if (!info) {
            return fail(res, 415, "Use a JPEG image (.jpg) or an MP4/MOV video. Instagram doesn't accept PNG/WebP via the API.");
        }
        if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, "Empty file");

        // Cloudinary set up -> permanent public https link (no ngrok, survives Render restarts)
        if (cloudStorage.isConfigured()) {
            const up = await cloudStorage.uploadBuffer(req.body, { folder: "instagram", resourceType: info.type === "video" ? "video" : "image", mimeType: mime, filename: `upload.${info.ext}` });
            return res.status(201).json({ success: true, data: { type: info.type, url: up.url, mimeType: mime, source: "upload", publicReachable: true } });
        }

        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const name = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${info.ext}`;
        await fs.promises.writeFile(path.join(UPLOAD_DIR, name), req.body);

        const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
        const url = `${base}/uploads/instagram/${name}`;
        const publicReachable = !/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/.test(url);

        return res.status(201).json({
            success: true,
            data: { type: info.type, url, mimeType: mime, source: "upload", publicReachable },
        });
    } catch (err) {
        next(err);
    }
};





//   add new feature to create instargrm story 

const createInstagramStory = async (req, res, next) => {
    try {
        const { mediaUrl, mediaType } = req.body;

        const result = await publishInstagramStory({
            mediaUrl,
            mediaType,
        });

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};



module.exports = { researchFromBrief, startResearchJob, getResearchJob, applyLiveHashtags, generatePost, listPosts, getPost, updatePost, revisePost, approvePost, publishPost, schedulePost, unschedulePost, publishScheduled, uploadMedia, createInstagramStory, };
