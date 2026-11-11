// ─────────────────────────────────────────────────────────────
// weeklyPlanService.js — Parallel Generation Engine & Scheduler
// Generates captions & images with concurrency control,
// streams live updates via Socket.IO, and schedules approved posts.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const WeeklyPlan = require("../models/WeeklyPlan.js");
const Product = require("../models/Product.js");
const InstagramPost = require("../models/InstagramPost.js");
const FacebookPost = require("../models/FacebookPost.js");
const YouTubePost = require("../models/YouTubePost.js");
const LLMFactory = require("../llm/factory/LLMFactory");
const geminiClient = require("./imageGen/geminiImageClient.js");
const stabilityClient = require("./imageGen/stabilityClient.js");
const cloudflareClient = require("./imageGen/cloudflareImageClient.js");
const { sanitizeVisualPrompt, STRICT_NEGATIVE_PROMPT } = require("./imageGen/promptSanitizer.js");
const { resolveBrandProfile } = require("./imageGen/brandProfileResolver.js");
const { renderWithAutoCorrection } = require("./imageGen/autoCorrector.js");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "weekly");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const getBackendUrl = () => (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");

/**
 * Socket.IO live event emitter helper
 */
const emitSocketUpdate = (planId, slot) => {
  try {
    const { getIO } = require("./inbox/socketService.js");
    const io = getIO ? getIO() : null;
    if (io) {
      io.emit(`weekly_plan:${planId}:update`, {
        slotId: slot.slotId,
        status: slot.status,
        caption: slot.caption,
        hashtags: slot.hashtags,
        mediaUrls: slot.mediaUrls,
        isApproved: slot.isApproved,
        error: slot.error,
      });
    }
  } catch {
    // Socket.IO may not be initialized in non-server test environments
  }
};

/**
 * Generate stylized fallback banner image if external image APIs are offline
 */
const generateFallbackImage = async (topic, dayName, width = 1080, height = 1080) => {
  const safeTopic = (topic || "Weekly Social Post").slice(0, 50).replace(/[<>&]/g, "");
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#181824" />
        <stop offset="50%" stop-color="#241b35" />
        <stop offset="100%" stop-color="#0e0c15" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#8b5cf6" />
        <stop offset="100%" stop-color="#ec4899" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    <circle cx="850" cy="200" r="280" fill="url(#glow)" opacity="0.25" filter="blur(60px)" />
    <circle cx="200" cy="850" r="320" fill="#3b82f6" opacity="0.18" filter="blur(80px)" />
    
    <rect x="80" y="80" width="160" height="42" rx="21" fill="rgba(255,255,255,0.08)" />
    <text x="160" y="107" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#a78bfa" text-anchor="middle" letter-spacing="1">
      ${dayName.toUpperCase()}
    </text>

    <text x="80" y="520" font-family="system-ui, sans-serif" font-size="48" font-weight="800" fill="#ffffff">
      ${safeTopic}
    </text>
    <text x="80" y="570" font-family="system-ui, sans-serif" font-size="22" font-weight="500" fill="#94a3b8">
      Curated AI Weekly Content Sprint · Sociva
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
};

/**
 * Generate raw image buffer from active AI image engine
 */
const generateImageBuffer = async (prompt, format = "image", dayName = "Day", topic = "", productProfile = {}) => {
  const isReel = format === "reel";
  const aspectRatio = isReel ? "9:16" : "1:1";
  const width = isReel ? 1080 : 1080;
  const height = isReel ? 1920 : 1080;

  // Sanitize prompt for Layer 1: Strip text commands to guarantee clean background
  const sanitized = sanitizeVisualPrompt(prompt, {
    aspectRatio,
    brandName: productProfile?.name || "Brand",
    category: productProfile?.category || "general",
  });
  const cleanPrompt = sanitized.visualPrompt;
  const activeProvider = String(process.env.IMAGE_PROVIDER || "").trim().toLowerCase();

  // Helper generators
  const tryCloudflare = async () => {
    if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
      const cfRes = await cloudflareClient.generateImage({ prompt: cleanPrompt, aspectRatio });
      if (cfRes?.image) return cfRes.image;
    }
    return null;
  };

  const tryGemini = async () => {
    if (process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY) {
      const res = await geminiClient.generateImage({
        prompt: cleanPrompt,
        aspectRatio: isReel ? "9:16" : "1:1",
      });
      if (res?.image) return res.image;
    }
    return null;
  };

  const tryStability = async () => {
    if (process.env.STABILITY_API_KEY) {
      const form = new FormData();
      form.append("prompt", cleanPrompt);
      form.append("negative_prompt", STRICT_NEGATIVE_PROMPT);
      form.append("aspect_ratio", isReel ? "9:16" : "1:1");
      form.append("output_format", "png");
      const res = await stabilityClient.postForm("/v2beta/stable-image/generate/ultra", form);
      if (res?.image) return Buffer.from(res.image, "base64");
    }
    return null;
  };

  // Determine priority order based on IMAGE_PROVIDER
  const providersOrder = [];
  if (activeProvider === "cloudflare") {
    providersOrder.push({ name: "Cloudflare", fn: tryCloudflare });
    providersOrder.push({ name: "Gemini", fn: tryGemini });
    providersOrder.push({ name: "Stability", fn: tryStability });
  } else if (activeProvider === "stability") {
    providersOrder.push({ name: "Stability", fn: tryStability });
    providersOrder.push({ name: "Gemini", fn: tryGemini });
    providersOrder.push({ name: "Cloudflare", fn: tryCloudflare });
  } else {
    // default: gemini first
    providersOrder.push({ name: "Gemini", fn: tryGemini });
    providersOrder.push({ name: "Cloudflare", fn: tryCloudflare });
    providersOrder.push({ name: "Stability", fn: tryStability });
  }

  for (const p of providersOrder) {
    try {
      const img = await p.fn();
      if (img) return img;
    } catch (err) {
      console.warn(`[WeeklyPlanService] ${p.name} image gen skipped:`, err.message);
    }
  }

  // 4. Stylized SVG Canvas Fallback
  return generateFallbackImage(topic, dayName, width, height);
};

/**
 * Save image buffer to local uploads directory and return public URL
 */
const saveImageToUploads = async (buffer, slotId) => {
  const filename = `week_${slotId}_${crypto.randomBytes(4).toString("hex")}.jpg`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await sharp(buffer).jpeg({ quality: 92 }).toFile(filepath);
  return `${getBackendUrl()}/uploads/weekly/${filename}`;
};

/**
 * Generate high-converting caption + hashtags for a slot using LLM
 */
const generateSlotCaption = async ({ slot, productProfile }) => {
  const brandName = productProfile?.name || "Brand";
  const systemInstruction = `You are an expert social media copywriter.
Write an engaging, high-retention post caption for ${brandName}.
Platform: ${slot.platform || "instagram"}
Format: ${slot.format || "image"}
Topic: ${slot.topic}
Hook: ${slot.hook}

Rules:
1. Start with the hook in the first line.
2. Provide high-value, easy-to-read content formatted with line-breaks and bullet points.
3. Include an engaging Call To Action (CTA).
4. Provide 5-8 hyper-relevant hashtags without spaces.
5. Return JSON format:
   {
     "caption": "Full formatted caption here...",
     "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
   }`;

  const llm = LLMFactory.create();
  const raw = await llm.generate({
    systemInstruction,
    input: `Write caption for topic: "${slot.topic}". Hook: "${slot.hook}".`,
    temperature: 0.4,
  });

  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    return {
      caption: parsed.caption || `${slot.hook}\n\n${slot.topic}\n\nComment below your thoughts!`,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ["sociva", "marketing", "growth"],
    };
  } catch {
    return {
      caption: `${slot.hook}\n\n${slot.topic}\n\nStay tuned for more updates from ${brandName}!`,
      hashtags: ["trending", "brand", "growth"],
    };
  }
};

/**
 * Process a single slot: generate copy + image, update MongoDB, and emit Socket.IO
 */
const processSingleSlot = async (planId, slot, productProfile) => {
  try {
    // 1. Generate Caption & Hashtags
    const { caption, hashtags } = await generateSlotCaption({ slot, productProfile });

    // 2. Resolve Brand Profile for Layer 2 Typography & Colors
    const brand = resolveBrandProfile(productProfile);

    // 3. Generate Image(s) using Two-Layer Pipeline (AI Visual + Programmatic Typography)
    const mediaUrls = [];
    let lastQualityReport = null;
    const imageCount = slot.format === "carousel" ? 3 : 1;
    const isReel = slot.format === "reel";
    const aspectRatio = isReel ? "9:16" : "1:1";

    for (let i = 0; i < imageCount; i++) {
      const slidePrompt = slot.format === "carousel"
        ? `${slot.imagePrompt}, scene ${i + 1} of 3, commercial aesthetic`
        : slot.imagePrompt;

      // Layer 1: Clean background visual
      const rawVisualBuffer = await generateImageBuffer(slidePrompt, slot.format, slot.dayName, slot.topic, productProfile);

      // Layer 2: Determine slide-specific typography content
      let slideContent;
      if (slot.format === "carousel") {
        if (i === 0) {
          // Slide 1: Cover Slide
          slideContent = {
            kicker: `${slot.dayName} · Swipe →`,
            headline: slot.topic,
            subline: slot.hook,
            cta: "Swipe to learn",
          };
        } else if (i === 1) {
          // Slide 2: Myth / Fact / Key Breakdown
          const captionBullets = caption
            .split("\n")
            .filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-") || l.trim().startsWith("*") || /^(?:myth|fact|tip):/i.test(l.trim()))
            .map((l) => l.replace(/^[•\-\*]\s*/, "").trim())
            .filter(Boolean);

          const bullets = captionBullets.length >= 2
            ? captionBullets.slice(0, 3)
            : [
                `Point 1: ${(slot.topic || "Understanding key facts").slice(0, 42)}`,
                `Point 2: ${(slot.hook || "Scientific research shows clear benefits").slice(0, 48)}`,
              ];

          slideContent = {
            kicker: "Deep Dive",
            headline: (slot.topic || "Key Insights").slice(0, 36),
            bullets,
            cta: "Next slide →",
          };
        } else {
          // Slide 3: Conclusion & Brand CTA
          slideContent = {
            kicker: "Summary",
            headline: `Action Plan · ${brand.brandName}`,
            subline: "Save this post and follow for daily actionable strategies.",
            cta: "Save & Share",
          };
        }
      } else {
        // Single Image or Reel
        slideContent = {
          kicker: slot.dayName,
          headline: slot.topic,
          subline: slot.hook,
          cta: "Read caption for full details",
        };
      }

      // Execute Layer 2 Programmatic Typography + Automated QA & Auto-Correction
      const { finalBuffer, qualityScore, correctionsApplied } = await renderWithAutoCorrection({
        backgroundBuffer: rawVisualBuffer,
        aspectRatio,
        content: slideContent,
        brand,
      });

      lastQualityReport = qualityScore;

      const url = await saveImageToUploads(finalBuffer, `${slot.slotId}_${i + 1}`);
      mediaUrls.push(url);
    }

    // 4. Update MongoDB with mediaUrls & quality report
    const updatedPlan = await WeeklyPlan.findOneAndUpdate(
      { _id: planId, "slots.slotId": slot.slotId },
      {
        $set: {
          "slots.$.caption": caption,
          "slots.$.hashtags": hashtags,
          "slots.$.mediaUrls": mediaUrls,
          "slots.$.qualityReport": lastQualityReport,
          "slots.$.status": "ready",
          "slots.$.error": null,
        },
      },
      { returnDocument: "after" }
    );

    const updatedSlot = updatedPlan?.slots.find((s) => s.slotId === slot.slotId);
    if (updatedSlot) {
      emitSocketUpdate(planId, updatedSlot);
    }

    return { success: true, slotId: slot.slotId, mediaUrls, qualityReport: lastQualityReport };
  } catch (err) {
    console.error(`[WeeklyPlanService] Failed slot ${slot.slotId}:`, err);
    await WeeklyPlan.findOneAndUpdate(
      { _id: planId, "slots.slotId": slot.slotId },
      {
        $set: {
          "slots.$.status": "failed",
          "slots.$.error": err.message || "Generation error",
        },
      }
    );
    emitSocketUpdate(planId, { slotId: slot.slotId, status: "failed", error: err.message });
    return { success: false, slotId: slot.slotId, error: err.message };
  }
};

/**
 * Execute Parallel Batch Generation with Controlled Concurrency (3 workers)
 */
const executeBatchGeneration = async (planId) => {
  const plan = await WeeklyPlan.findById(planId);
  if (!plan) throw new Error("Weekly Plan not found");

  const product = await Product.findById(plan.productId);
  const productProfile = product?.aiProfile || {};

  // Find ungenerated slots
  const slotsToProcess = plan.slots.filter((s) => s.status === "blueprint" || s.status === "failed");
  if (!slotsToProcess.length) return plan;

  // Mark in-progress
  await WeeklyPlan.findByIdAndUpdate(planId, { overallStatus: "generating" });

  for (const s of slotsToProcess) {
    await WeeklyPlan.findOneAndUpdate(
      { _id: planId, "slots.slotId": s.slotId },
      { $set: { "slots.$.status": "generating" } }
    );
    emitSocketUpdate(planId, { slotId: s.slotId, status: "generating" });
  }

  // Worker pool concurrency of 3
  const CONCURRENCY = 3;
  const queue = [...slotsToProcess];

  const runWorker = async () => {
    while (queue.length > 0) {
      const slot = queue.shift();
      if (slot) {
        await processSingleSlot(planId, slot, productProfile);
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, slotsToProcess.length) }, () => runWorker());
  await Promise.allSettled(workers);

  // Update overall plan status to review
  const finalPlan = await WeeklyPlan.findByIdAndUpdate(
    planId,
    { overallStatus: "review" },
    { returnDocument: "after" }
  );

  return finalPlan;
};

/**
 * Regenerate a single slot on user request
 */
const regenerateSingleSlot = async (planId, slotId) => {
  const plan = await WeeklyPlan.findById(planId);
  if (!plan) throw new Error("Weekly Plan not found");

  const slot = plan.slots.find((s) => s.slotId === slotId);
  if (!slot) throw new Error("Slot not found");

  const product = await Product.findById(plan.productId);
  const productProfile = product?.aiProfile || {};

  // Mark generating
  await WeeklyPlan.findOneAndUpdate(
    { _id: planId, "slots.slotId": slotId },
    { $set: { "slots.$.status": "generating", "slots.$.isApproved": false } }
  );
  emitSocketUpdate(planId, { slotId, status: "generating", isApproved: false });

  // Run generation
  await processSingleSlot(planId, slot, productProfile);

  return WeeklyPlan.findById(planId);
};

/**
 * Helper to combine date object and time string ("10:30") into ISO Date
 */
const combineDateAndTime = (dateObj, timeStr = "10:00") => {
  const d = new Date(dateObj);
  const [hours, minutes] = String(timeStr).split(":").map(Number);
  d.setHours(isNaN(hours) ? 10 : hours);
  d.setMinutes(isNaN(minutes) ? 0 : minutes);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

/**
 * Schedule all approved slots into live Post models
 */
const scheduleApprovedSlots = async (planId, userId) => {
  const plan = await WeeklyPlan.findById(planId);
  if (!plan) throw new Error("Weekly Plan not found");

  const approvedSlots = plan.slots.filter((s) => s.isApproved && s.status === "ready");
  if (!approvedSlots.length) {
    throw new Error("No approved posts ready to schedule. Please approve at least one day first.");
  }

  const createdPostIds = [];

  for (const slot of approvedSlots) {
    const scheduledAt = combineDateAndTime(slot.date, slot.time);
    const mediaItems = (slot.mediaUrls || []).map((u) => ({
      type: slot.format === "reel" ? "video" : "image",
      url: u,
      source: "url",
    }));

    let createdDoc = null;

    if (slot.platform === "youtube") {
      createdDoc = await YouTubePost.create({
        userId,
        productId: plan.productId,
        contentType: slot.format === "video" ? "video" : "short",
        status: "scheduled",
        scheduledAt,
        content: {
          title: (slot.topic || "Weekly Content").slice(0, 99),
          description: slot.caption || "",
          tags: slot.hashtags || [],
          categoryId: "22",
          privacyStatus: "public",
        },
        thumbnail: { url: slot.mediaUrls[0] || null },
      });
    } else if (slot.platform === "facebook") {
      createdDoc = await FacebookPost.create({
        userId,
        productId: plan.productId,
        contentType: slot.format === "carousel" ? "carousel" : slot.format === "reel" ? "reel" : "image",
        status: "scheduled",
        scheduledAt,
        scheduledPlacement: "feed",
        content: {
          caption: slot.caption || "",
          text: slot.caption || "",
          title: slot.topic || "",
          hook: slot.hook || "",
          hashtags: slot.hashtags || [],
          callToAction: "Follow for more daily updates!",
          visual: {
            brief: slot.topic || "",
            aspectRatio: slot.format === "reel" ? "9:16" : "4:5",
          },
        },
        media: mediaItems,
      });
    } else {
      // Default to Instagram
      createdDoc = await InstagramPost.create({
        userId,
        productId: plan.productId,
        contentType: slot.format === "carousel" ? "carousel" : slot.format === "reel" ? "reel" : "image",
        status: "scheduled",
        scheduledAt,
        scheduledPlacement: "feed",
        content: {
          caption: slot.caption || "",
          title: slot.topic || "",
          hook: slot.hook || "",
          hashtags: slot.hashtags || [],
          callToAction: "Follow for more daily tips!",
          visual: {
            brief: slot.topic || "",
            aspectRatio: slot.format === "reel" ? "9:16" : "4:5",
          },
        },
        media: mediaItems,
      });
    }

    if (createdDoc) {
      createdPostIds.push(createdDoc._id);
      await WeeklyPlan.findOneAndUpdate(
        { _id: planId, "slots.slotId": slot.slotId },
        { $set: { "slots.$.postId": createdDoc._id } }
      );
    }
  }

  const updatedPlan = await WeeklyPlan.findByIdAndUpdate(
    planId,
    { overallStatus: "scheduled" },
    { returnDocument: "after" }
  );

  return { plan: updatedPlan, scheduledCount: createdPostIds.length, postIds: createdPostIds };
};

module.exports = {
  executeBatchGeneration,
  regenerateSingleSlot,
  scheduleApprovedSlots,
};

