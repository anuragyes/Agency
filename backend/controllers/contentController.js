// ─────────────────────────────────────────────────────────────
// contentController.js — Studio steps 2 + 3
//   GET  /api/content/platforms   platforms for step 4 (live = researcher + publish exist)
//   POST /api/content/brief       { userPrompt, productId? } -> optimized prompt + important words as JSON
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const Product = require("../models/Product.js");
const generateContentBrief = require("../ai/contentBrief/ContentBriefAgent.js");
const ragService = require("../services/ragService.js");
const { PLATFORM_SPECS, PLATFORMS } = require("../ai/contentBrief/PlatformBriefSpecs.js");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const listPlatforms = (req, res) => {
    res.json({
        success: true,
        data: PLATFORMS.map((key) => ({ key, label: PLATFORM_SPECS[key].label, formats: PLATFORM_SPECS[key].formats, live: PLATFORM_SPECS[key].live })),
    });
};

const createBrief = async (req, res, next) => {
    try {
        const { productId, productProfile: profileInBody, userPrompt } = req.body || {};
        if (!userPrompt || !String(userPrompt).trim()) return fail(res, 400, "Write about your product first (userPrompt)");

        let productProfile = profileInBody && typeof profileInBody === "object" ? profileInBody : {};
        let ragContext = null;

        if (productId) {
            if (!mongoose.isValidObjectId(productId)) return fail(res, 400, "Invalid productId");
            const product = await Product.findById(productId);
            if (product?.aiProfile) productProfile = product.aiProfile;

            // RAG Query Retrieval: Retrieve top relevant chunks for this specific user prompt
            try {
                ragContext = await ragService.retrieveContext({
                    productId,
                    userPrompt: String(userPrompt).trim(),
                    topK: 2,
                });
                console.log(`[RAG] Retrieved ${ragContext.chunks.length} chunks. Tokens saved estimate: ~${ragContext.tokensSaved}`);
            } catch (e) {
                console.warn("[RAG] Retrieval fallback:", e.message);
            }
        }

        const { brief, usage } = await generateContentBrief({
            userPrompt: String(userPrompt).trim(),
            productProfile,
            ragContext: ragContext?.contextText || null,
        });
        console.log(`[PromptOptimizer] in=${usage.promptTokens}t out=${usage.completionTokens}t words=${brief.importantWords.join(", ")}`);

        return res.json({
            success: true,
            data: brief,
            usage,
            rag: ragContext
                ? {
                    retrievedChunks: ragContext.chunks.map((c) => ({ chunkId: c.chunkId, title: c.title, category: c.category })),
                    tokensSaved: ragContext.tokensSaved,
                }
                : null,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { listPlatforms, createBrief };
