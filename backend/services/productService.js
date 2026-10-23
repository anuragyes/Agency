const Product = require("../models/Product.js");
const InstagramPost = require("../models/InstagramPost.js");
const FacebookPost = require("../models/FacebookPost.js");
const generateProductProfile = require("../ai/ProductAiAgent.js");
const { buildBrandKnowledge } = require("./websiteService.js");

// toText turns req.body (string OR { description: "..." }) into plain text
const { toText } = generateProductProfile._internals;

// ─────────────────────────────────────────────────────────────
// createProduct — Phase 1 of the pipeline: raw text / website -> AI Brand Profile -> MongoDB + knowledge.md
// ─────────────────────────────────────────────────────────────
const createProduct = async (productData, userId = null) => {
    const isProjectSetup = typeof productData === "object" && (productData.websiteUrl || productData.name);

    if (isProjectSetup) {
        const { name, description, websiteUrl } = productData;
        const brandResult = await buildBrandKnowledge({
            name: name || "",
            description: description || toText(productData),
            websiteUrl: websiteUrl || "",
        });

        const product = await Product.create({
            ...(userId && { userId }),
            rawInput: `${name || ""} - ${description || ""} ${websiteUrl ? `(${websiteUrl})` : ""}`.trim(),
            websiteUrl: websiteUrl || "",
            knowledgeMd: brandResult.knowledgeMd || "",
            knowledgeFilePath: brandResult.filePath || "",
            knowledgeChunks: brandResult.chunks || [],
            aiProfile: brandResult.aiProfile,
        });

        return product;
    }

    // Default legacy flow
    const aiProfile = await generateProductProfile(productData);
    const product = await Product.create({
        ...(userId && { userId }),
        rawInput: toText(productData),
        aiProfile,
    });
    return product;
};

// List all products with post stats (total, scheduled, published, draft), newest first
const getProducts = async (userId = null) => {
    if (!userId) {
        return [];
    }
    const filter = { userId };
    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    try {
        const [igCounts, fbCounts] = await Promise.all([
            InstagramPost.aggregate([
                {
                    $group: {
                        _id: "$productId",
                        total: { $sum: 1 },
                        scheduled: { $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] } },
                        published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
                        draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
                    },
                },
            ]),
            FacebookPost.aggregate([
                {
                    $group: {
                        _id: "$productId",
                        total: { $sum: 1 },
                        scheduled: { $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] } },
                        published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
                        draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
                    },
                },
            ]),
        ]);

        const map = {};
        for (const item of [...igCounts, ...fbCounts]) {
            if (!item._id) continue;
            const k = String(item._id);
            if (!map[k]) map[k] = { total: 0, scheduled: 0, published: 0, draft: 0 };
            map[k].total += item.total || 0;
            map[k].scheduled += item.scheduled || 0;
            map[k].published += item.published || 0;
            map[k].draft += item.draft || 0;
        }

        return products.map((p) => {
            const stats = map[String(p._id)] || { total: 0, scheduled: 0, published: 0, draft: 0 };
            return {
                ...p,
                postCount: stats.total,
                scheduledCount: stats.scheduled,
                publishedCount: stats.published,
                draftCount: stats.draft,
                chunkCount: p.knowledgeChunks?.length || (p.knowledgeMd ? 1 : 0),
            };
        });
    } catch {
        return products;
    }
};

const ragService = require("./ragService.js");

// One product by Mongo _id (returns null when not found)
const getProductById = async (id) => {
    return await Product.findById(id);
};

// Get Brand Knowledge Markdown & RAG context
const getProductKnowledge = async (id) => {
    const product = await Product.findById(id);
    if (!product) return null;
    const chunks = await ragService.ensureProductChunks(product);
    return {
        _id: product._id,
        name: product.aiProfile?.name || product.rawInput,
        websiteUrl: product.websiteUrl || "",
        knowledgeMd: product.knowledgeMd || product.aiProfile?.knowledgeMd || "",
        knowledgeChunks: chunks || [],
        websiteSummary: product.aiProfile?.websiteSummary || "",
        aiProfile: product.aiProfile,
    };
};

module.exports = {
    createProduct,
    getProducts,
    getProductById,
    getProductKnowledge,
};

