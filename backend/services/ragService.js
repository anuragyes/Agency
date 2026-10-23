// ─────────────────────────────────────────────────────────────
// ragService.js — High-Performance Project RAG (Retrieval-Augmented Generation)
//
// 1. Semantic Chunking: splits product knowledge into discrete, topical chunks
//    (Overview, Products & Pricing, Audience & Pain Points, USPs & Benefits, Tone & Rules).
// 2. Query Retrieval: when user creates a post, retrieves ONLY the 1-2 relevant chunks
//    instead of dumping the whole 3,000+ token document (85-95% token savings!).
// 3. Incremental Updates: users can edit, add, or delete chunks anytime without
//    reprocessing the entire knowledge base.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const Product = require("../models/Product.js");

const makeId = () => crypto.randomBytes(6).toString("hex");

/** Stopwords filtered out during retrieval scoring */
const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "for", "in", "on", "at", "to",
    "from", "by", "with", "about", "into", "through", "during", "is", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "can", "could", "will",
    "would", "should", "our", "we", "us", "your", "you", "my", "i", "me", "this", "that",
    "these", "those", "it", "its", "make", "create", "post", "social", "media"
]);

/**
 * Tokenize a string into cleaned word tokens
 */
function tokenize(text = "") {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Parse markdown into sections by header (## Title)
 */
function parseMarkdownSections(markdown = "") {
    if (!markdown || typeof markdown !== "string") return [];

    const lines = markdown.split("\n");
    const sections = [];
    let currentTitle = "Overview";
    let currentLines = [];

    for (const line of lines) {
        const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
        if (headingMatch) {
            if (currentLines.length > 0) {
                const content = currentLines.join("\n").trim();
                if (content.length > 20) {
                    sections.push({ title: currentTitle, content });
                }
            }
            currentTitle = headingMatch[1].trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        if (content.length > 20) {
            sections.push({ title: currentTitle, content });
        }
    }

    return sections;
}

/**
 * Categorize a section title into standard brand categories
 */
function categorizeSection(title = "") {
    const t = title.toLowerCase();
    if (t.includes("product") || t.includes("offer") || t.includes("catalog") || t.includes("price") || t.includes("pricing") || t.includes("course") || t.includes("game")) {
        return "products_catalog";
    }
    if (t.includes("audience") || t.includes("persona") || t.includes("customer") || t.includes("who") || t.includes("student") || t.includes("parent")) {
        return "target_audience";
    }
    if (t.includes("usp") || t.includes("benefit") || t.includes("value") || t.includes("why") || t.includes("differentiator") || t.includes("feature")) {
        return "value_props_usps";
    }
    if (t.includes("tone") || t.includes("voice") || t.includes("style") || t.includes("guideline") || t.includes("angle")) {
        return "brand_voice";
    }
    return "brand_overview";
}

/**
 * Chunk markdown knowledge or product profile into discrete RAG chunks
 */
function chunkKnowledge({ markdown = "", aiProfile = {}, brandName = "" } = {}) {
    const p = aiProfile || {};
    const name = brandName || p.name || "Brand";

    const sections = parseMarkdownSections(markdown);
    const chunks = [];

    if (sections.length >= 2) {
        // Use parsed Markdown sections
        for (const s of sections) {
            const cat = categorizeSection(s.title);
            chunks.push({
                chunkId: makeId(),
                title: s.title,
                category: cat,
                content: s.content,
                tags: tokenize(`${s.title} ${s.content}`).slice(0, 8),
                updatedAt: new Date(),
            });
        }
    } else {
        // Build structured chunks from aiProfile & description
        // Chunk 1: Brand Overview
        const overviewContent = p.description || p.positioning || `${name} provides specialized products and services.`;
        chunks.push({
            chunkId: makeId(),
            title: "Brand Overview & Mission",
            category: "brand_overview",
            content: overviewContent,
            tags: tokenize(`${name} ${p.category || ""} ${overviewContent}`).slice(0, 8),
            updatedAt: new Date(),
        });

        // Chunk 2: Products & Catalog
        const features = (p.features || []).map((f) => `- ${f}`).join("\n");
        const priceStr = p.price?.amount ? `Pricing: ${p.price.currency || "INR"} ${p.price.amount}` : "";
        const productsContent = [features, priceStr, p.websiteSummary].filter(Boolean).join("\n\n") || `${name} product offerings and features.`;
        chunks.push({
            chunkId: makeId(),
            title: "Products, Offerings & Pricing",
            category: "products_catalog",
            content: productsContent,
            tags: tokenize(`products pricing ${features} ${priceStr}`).slice(0, 8),
            updatedAt: new Date(),
        });

        // Chunk 3: Target Audience
        if (p.targetAudience && p.targetAudience.length > 0) {
            const audienceContent = (p.targetAudience || []).map((a) => `- ${a}`).join("\n");
            chunks.push({
                chunkId: makeId(),
                title: "Target Audience & Customer Personas",
                category: "target_audience",
                content: audienceContent,
                tags: tokenize(`audience personas customers ${audienceContent}`).slice(0, 8),
                updatedAt: new Date(),
            });
        }

        // Chunk 4: USPs & Benefits
        if (p.benefits && p.benefits.length > 0) {
            const benefitsContent = (p.benefits || []).map((b) => `- ${b}`).join("\n");
            chunks.push({
                chunkId: makeId(),
                title: "Core Value Propositions & USPs",
                category: "value_props_usps",
                content: benefitsContent,
                tags: tokenize(`benefits differentiators usps ${benefitsContent}`).slice(0, 8),
                updatedAt: new Date(),
            });
        }

        // Chunk 5: Tone & Keywords
        if (p.keywords && p.keywords.length > 0) {
            const toneContent = `Keywords: ${(p.keywords || []).join(", ")}\nPositioning: ${p.positioning || "Engaging and trustworthy"}`;
            chunks.push({
                chunkId: makeId(),
                title: "Tone of Voice & Core Keywords",
                category: "brand_voice",
                content: toneContent,
                tags: tokenize(`tone voice keywords ${toneContent}`).slice(0, 8),
                updatedAt: new Date(),
            });
        }
    }

    return chunks;
}

/**
 * Ensure product has chunks initialized in MongoDB
 */
async function ensureProductChunks(product) {
    if (!product) return [];
    if (Array.isArray(product.knowledgeChunks) && product.knowledgeChunks.length > 0) {
        return product.knowledgeChunks;
    }

    const chunks = chunkKnowledge({
        markdown: product.knowledgeMd || product.aiProfile?.knowledgeMd || "",
        aiProfile: product.aiProfile || {},
        brandName: product.aiProfile?.name || product.rawInput || "Project",
    });

    if (chunks.length > 0) {
        product.knowledgeChunks = chunks;
        await product.save().catch(() => {});
    }

    return chunks;
}

/**
 * Retrieve the most relevant chunks for a user post prompt (RAG Retrieval)
 * Cuts token usage from ~3000 tokens down to ~150 tokens!
 */
async function retrieveContext({ productId, userPrompt = "", topK = 2 } = {}) {
    if (!productId) return { chunks: [], contextText: "", tokensSaved: 0 };

    const product = await Product.findById(productId);
    if (!product) return { chunks: [], contextText: "", tokensSaved: 0 };

    const chunks = await ensureProductChunks(product);
    if (!chunks || chunks.length === 0) {
        return { chunks: [], contextText: "", tokensSaved: 0 };
    }

    const promptTokens = tokenize(userPrompt);
    const promptText = userPrompt.toLowerCase();

    // Intent boosters
    const wantsPricing = /price|cost|pricing|offer|discount|deal|sale|₹|\$|cheap|buy/i.test(promptText);
    const wantsAudience = /who|kids|parents|students|customers|audience|users|beginners|families/i.test(promptText);
    const wantsUSPs = /why|better|difference|unique|best|problem|solve|benefit/i.test(promptText);
    const wantsTone = /tone|voice|style|humor|formal|casual|hinglish/i.test(promptText);

    const scored = chunks.map((chunk) => {
        let score = 0;
        const chunkTokens = tokenize(`${chunk.title} ${chunk.content} ${(chunk.tags || []).join(" ")}`);
        const chunkTokenSet = new Set(chunkTokens);

        // Term frequency match
        for (const token of promptTokens) {
            if (chunkTokenSet.has(token)) {
                score += 3;
            }
        }

        // Substring / exact keyword matches
        for (const tag of chunk.tags || []) {
            if (promptText.includes(tag.toLowerCase())) {
                score += 2;
            }
        }

        // Category boosts
        if (wantsPricing && chunk.category === "products_catalog") score += 5;
        if (wantsAudience && chunk.category === "target_audience") score += 5;
        if (wantsUSPs && chunk.category === "value_props_usps") score += 5;
        if (wantsTone && chunk.category === "brand_voice") score += 4;

        // Base overview guarantee
        if (chunk.category === "brand_overview") score += 1;

        return { chunk, score };
    });

    // Sort by relevance score descending
    scored.sort((a, b) => b.score - a.score);

    // Pick topK chunks (fallback to at least the top 1 or overview if scores are 0)
    let selected = scored.slice(0, topK).map((s) => s.chunk);
    if (!selected.length || (scored[0].score === 0 && scored.length > 0)) {
        selected = [chunks[0]];
    }

    const brandName = product.aiProfile?.name || product.rawInput?.slice(0, 24) || "Project";
    const contextLines = [
        `[BRAND RAG GROUND TRUTH: ${brandName}]`,
    ];

    for (const c of selected) {
        contextLines.push(`### ${c.title}\n${c.content.slice(0, 400)}`);
    }

    const contextText = contextLines.join("\n\n");
    // Estimate tokens: full markdown (~3000 tokens) - retrieved context (~150 tokens)
    const fullTokens = Math.ceil(((product.knowledgeMd || "").length + 800) / 4);
    const leanTokens = Math.ceil(contextText.length / 4);
    const tokensSaved = Math.max(0, fullTokens - leanTokens);

    return {
        chunks: selected,
        contextText,
        tokensSaved,
        totalChunks: chunks.length,
    };
}

/**
 * Add a new chunk incrementally (no need to re-crawl or re-process)
 */
async function addKnowledgeChunk(productId, { title, content, category, tags = [] }) {
    if (!productId || !title || !content) throw new Error("title and content are required");

    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    await ensureProductChunks(product);

    const newChunk = {
        chunkId: makeId(),
        title: title.trim(),
        category: category || categorizeSection(title),
        content: content.trim(),
        tags: tags.length ? tags : tokenize(`${title} ${content}`).slice(0, 8),
        updatedAt: new Date(),
    };

    product.knowledgeChunks.push(newChunk);

    // Append to knowledgeMd document as well
    const appendSection = `\n\n## ${newChunk.title}\n${newChunk.content}`;
    product.knowledgeMd = (product.knowledgeMd || "") + appendSection;

    await product.save();
    return { success: true, data: newChunk, totalChunks: product.knowledgeChunks.length };
}

/**
 * Update an existing chunk
 */
async function updateKnowledgeChunk(productId, chunkId, { title, content, category, tags }) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    await ensureProductChunks(product);

    const chunk = product.knowledgeChunks.find((c) => c.chunkId === chunkId);
    if (!chunk) throw new Error("Chunk not found");

    if (title) chunk.title = title.trim();
    if (content) chunk.content = content.trim();
    if (category) chunk.category = category;
    if (tags) chunk.tags = tags;
    chunk.updatedAt = new Date();

    // Rebuild full markdown from chunks
    product.knowledgeMd = product.knowledgeChunks
        .map((c) => `## ${c.title}\n${c.content}`)
        .join("\n\n");

    await product.save();
    return { success: true, data: chunk };
}

/**
 * Delete a specific chunk
 */
async function deleteKnowledgeChunk(productId, chunkId) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    await ensureProductChunks(product);

    product.knowledgeChunks = product.knowledgeChunks.filter((c) => c.chunkId !== chunkId);
    product.knowledgeMd = product.knowledgeChunks
        .map((c) => `## ${c.title}\n${c.content}`)
        .join("\n\n");

    await product.save();
    return { success: true, remaining: product.knowledgeChunks.length };
}

/**
 * Update full knowledge markdown and re-chunk
 */
async function updateFullKnowledge(productId, markdown) {
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    const brandName = product.aiProfile?.name || product.rawInput || "Brand";
    const chunks = chunkKnowledge({
        markdown: String(markdown || "").trim(),
        aiProfile: product.aiProfile || {},
        brandName,
    });

    product.knowledgeMd = String(markdown || "").trim();
    product.knowledgeChunks = chunks;
    await product.save();

    return {
        success: true,
        knowledgeMd: product.knowledgeMd,
        chunks,
        totalChunks: chunks.length,
    };
}

module.exports = {
    chunkKnowledge,
    ensureProductChunks,
    retrieveContext,
    addKnowledgeChunk,
    updateKnowledgeChunk,
    deleteKnowledgeChunk,
    updateFullKnowledge,
};
