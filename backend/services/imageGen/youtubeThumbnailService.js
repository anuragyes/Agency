// ─────────────────────────────────────────────────────────────
// youtubeThumbnailService.js — Full Pipeline for AI YouTube Thumbnails
// Distinct from Instagram ad generation:
// 1. YouTube visual prompt crafted by YouTubeThumbnailAgent
// 2. High-impact 16:9 or 9:16 background generation via active Image Engine
// 3. Bold stroke+shadow viral typography composition via youtubeThumbnailComposer
// 4. Persistence to /uploads/youtube/ and YouTubePost model
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const mongoose = require("mongoose");
const YouTubePost = require("../../models/YouTubePost.js");
const Product = require("../../models/Product.js");
const { planYouTubeThumbnail, THUMBNAIL_ARCHETYPES } = require("../../ai/imageGen/YouTubeThumbnailAgent.js");
const { composeYouTubeThumbnail } = require("./youtubeThumbnailComposer.js");
const geminiClient = require("./geminiImageClient.js");
const stabilityClient = require("./stabilityClient.js");
const cloudflareClient = require("./cloudflareImageClient.js");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "youtube");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Generate stylized fallback background if external AI engine is offline/unconfigured
 */
const generateFallbackBackground = async (width, height, archetype = "viral-shock") => {
    const arch = THUMBNAIL_ARCHETYPES[archetype] || THUMBNAIL_ARCHETYPES["viral-shock"];
    const accentColor = arch.defaultColor || "#FFE600";

    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="grad" cx="65%" cy="45%" r="65%">
                <stop offset="0%" stop-color="#2a1548" />
                <stop offset="50%" stop-color="#110726" />
                <stop offset="100%" stop-color="#05020c" />
            </radialGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="30" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad)" />
        <circle cx="${Math.round(width * 0.75)}" cy="${Math.round(height * 0.45)}" r="${Math.round(height * 0.35)}" fill="${accentColor}" opacity="0.18" filter="url(#glow)" />
        <path d="M 0,${height} L ${width},0 L ${width},${height} Z" fill="rgba(255,255,255,0.03)" />
    </svg>`;

    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
};

/**
 * Request background image from whichever AI provider is active
 */
const generateRawImage = async (visualPrompt, aspectRatio = "16:9", archetype = "viral-shock") => {
    const isShort = aspectRatio === "9:16";
    const width = isShort ? 1080 : 1920;
    const height = isShort ? 1920 : 1080;

    // 1. Try Gemini Image Generation
    try {
        if (process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY) {
            const res = await geminiClient.generateImage({
                prompt: `${visualPrompt}, YouTube thumbnail background, ultra-vibrant, 8k, cinematic, clean space for text on left side, do not render text`,
                aspectRatio: isShort ? "9:16" : "16:9",
            });
            if (res?.image) return res.image;
        }
    } catch (gErr) {
        console.warn("[YouTube Thumbnail] Gemini image generation skipped/failed:", gErr.message);
    }

    // 2. Try Stability AI
    try {
        if (process.env.STABILITY_API_KEY) {
            const form = new FormData();
            form.append("prompt", `${visualPrompt}, YouTube thumbnail, vibrant lighting, highly detailed`);
            form.append("aspect_ratio", isShort ? "9:16" : "16:9");
            form.append("output_format", "png");
            const res = await stabilityClient.postForm("/v2beta/stable-image/generate/ultra", form);
            if (res?.image) return Buffer.from(res.image, "base64");
        }
    } catch (sErr) {
        console.warn("[YouTube Thumbnail] Stability image generation skipped/failed:", sErr.message);
    }

    // 3. Try Cloudflare Workers AI
    try {
        if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
            const cfRes = await cloudflareClient.generateImage({
                prompt: visualPrompt,
                aspectRatio: isShort ? "9:16" : "16:9",
            });
            if (cfRes?.image) return cfRes.image;
        }
    } catch (cErr) {
        console.warn("[YouTube Thumbnail] Cloudflare image generation skipped/failed:", cErr.message);
    }

    // 4. Clean High-Resolution Fallback
    console.log("[YouTube Thumbnail] Using high-resolution stylized canvas fallback for thumbnail.");
    return generateFallbackBackground(width, height, archetype);
};

/**
 * End-to-end generate and save YouTube Thumbnail
 */
const createYouTubeThumbnail = async ({
    postId,
    productId,
    prompt: userPrompt = "",
    videoTitle = "",
    archetype = "viral-shock",
    overlayText: customText = "",
    textColor,
    aspectRatio = "16:9",
    position = "left",
} = {}) => {
    let productProfile = null;
    let postDoc = null;

    if (postId && mongoose.isValidObjectId(postId)) {
        postDoc = await YouTubePost.findById(postId);
        if (postDoc) {
            productProfile = postDoc.productProfile;
            if (!videoTitle) videoTitle = postDoc.content?.title || "";
            if (!userPrompt) userPrompt = postDoc.content?.hook || postDoc.brief?.optimizedPrompt || "";
            if (!aspectRatio) aspectRatio = postDoc.contentType === "short" ? "9:16" : "16:9";
        }
    }

    if (!productProfile && productId && mongoose.isValidObjectId(productId)) {
        const prod = await Product.findById(productId).lean();
        if (prod) productProfile = prod.aiProfile || prod;
    }

    // 1. Plan viral thumbnail concepts via YouTubeThumbnailAgent
    const plan = await planYouTubeThumbnail({
        userPrompt,
        videoTitle,
        archetype,
        productProfile,
    });

    const finalOverlayText = customText && customText.trim() ? customText.trim() : plan.overlayText;
    const finalTextColor = textColor || plan.recommendedColor || "#FFE600";

    // 2. Generate raw high-resolution image
    const rawBuffer = await generateRawImage(plan.visualPrompt, aspectRatio, archetype);

    // 3. Compose high-impact YouTube typography onto image
    const finalJpeg = await composeYouTubeThumbnail({
        imageBuffer: rawBuffer,
        overlayText: finalOverlayText,
        textColor: finalTextColor,
        position,
        aspectRatio,
    });

    // 4. Save to disk
    const filename = `thumbnail_${crypto.randomBytes(16).toString("hex")}.jpg`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(filePath, finalJpeg);

    const baseUrl = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
    const url = `${baseUrl}/uploads/youtube/${filename}`;

    // 5. Update postDoc if attached
    if (postDoc) {
        postDoc.thumbnail = {
            url,
            source: "ai",
            overlayText: finalOverlayText,
        };
        await postDoc.save();
    }

    return {
        url,
        filename,
        overlayText: finalOverlayText,
        textColor: finalTextColor,
        archetype,
        plan,
        aspectRatio,
    };
};

module.exports = {
    createYouTubeThumbnail,
    THUMBNAIL_ARCHETYPES,
};

