// ─────────────────────────────────────────────────────────────
// websiteService.js — Crawl website & extract RAG Brand Knowledge Base
// 1. Fetches website HTML and extracts clean text (titles, meta, products, copy)
// 2. Uses LLM to extract comprehensive brand knowledge & structured profile
// 3. Generates a clean Markdown knowledge file (knowledge.md) for RAG context
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const LLMFactory = require("../llm/factory/LLMFactory");
const { chunkKnowledge } = require("./ragService.js");

const KNOWLEDGE_DIR = path.join(__dirname, "..", "knowledge");

// Ensure knowledge directory exists
if (!fs.existsSync(KNOWLEDGE_DIR)) {
    try {
        fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    } catch (e) {
        console.warn("[websiteService] Could not create knowledge dir:", e.message);
    }
}

/** Clean & extract meaningful text from raw HTML */
function extractTextFromHtml(html = "") {
    if (!html || typeof html !== "string") return "";

    // Extract title & meta description
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

    // Remove script, style, svg, noscript, nav, footer, header tags
    let clean = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");

    // Replace header and paragraph tags with newlines
    clean = clean
        .replace(/<\/(h[1-6]|p|div|li|article|section)>/gi, "\n")
        .replace(/<br\s*[\/]?>/gi, "\n")
        .replace(/<[^>]+>/g, " ");

    // Unescape basic HTML entities
    clean = clean
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");

    // Collapse whitespace
    clean = clean
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 2)
        .join("\n");

    const parts = [];
    if (title) parts.push(`Page Title: ${title}`);
    if (metaDescription) parts.push(`Meta Description: ${metaDescription}`);
    parts.push(`Website Content:\n${clean}`);

    // Limit to ~8000 characters for token efficiency
    return parts.join("\n\n").slice(0, 8000);
}

/** Crawl website URL */
async function crawlWebsite(url) {
    if (!url || typeof url !== "string") return "";

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
    }

    try {
        console.log(`[websiteService] Crawling website: ${targetUrl}`);
        const response = await axios.get(targetUrl, {
            timeout: 10000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            maxRedirects: 5,
        });

        if (response.data && typeof response.data === "string") {
            const extracted = extractTextFromHtml(response.data);
            console.log(`[websiteService] Extracted ${extracted.length} chars from ${targetUrl}`);
            return extracted;
        }
        return "";
    } catch (err) {
        console.warn(`[websiteService] Failed to fetch website (${targetUrl}):`, err.message);
        return "";
    }
}

/** Build Brand Knowledge & Profile using LLM */
async function buildBrandKnowledge({ name = "", description = "", websiteUrl = "", llm = LLMFactory.create() } = {}) {
    let websiteText = "";
    if (websiteUrl) {
        websiteText = await crawlWebsite(websiteUrl);
    }

    const brandName = name.trim() || "Brand";
    const userDesc = description.trim() || "";

    const prompt = `You are Sociva's Chief Brand & Marketing Knowledge Agent.
Analyze this brand/business from their description and website content to create a comprehensive Brand Knowledge Base for social media post generation.

BRAND NAME:
${brandName}

USER DESCRIPTION:
${userDesc || "Not provided directly"}

${websiteText ? `WEBSITE SCRAPED CONTENT (${websiteUrl}):\n"""\n${websiteText}\n"""` : "NO WEBSITE CONTENT AVAILABLE."}

YOUR TASK:
1. Extract their complete product catalog, offerings, target audience, pricing/value, unique selling points (USPs), and brand tone of voice.
2. Return a valid JSON object with TWO parts:
   a) "aiProfile": structured product profile (name, category, description, features, benefits, uses, targetAudience, price {amount, currency}, positioning, keywords, websiteSummary)
   b) "knowledgeMd": a comprehensive, high-quality Markdown knowledge document detailing everything needed to craft viral social media posts for this brand.

Return ONLY this JSON schema:
{
  "aiProfile": {
    "name": "${brandName}",
    "category": "Retail category",
    "description": "Comprehensive description of what they sell and their value proposition",
    "features": ["feature 1", "feature 2"],
    "benefits": ["benefit 1", "benefit 2"],
    "uses": ["use 1", "use 2"],
    "targetAudience": ["target customer persona 1", "target customer persona 2"],
    "price": {
      "amount": 0,
      "currency": "INR"
    },
    "positioning": "Market positioning statement",
    "keywords": ["keyword 1", "keyword 2", "keyword 3"],
    "websiteSummary": "Concise summary of their website and product catalog"
  },
  "knowledgeMd": "# Brand Knowledge Base: ${brandName}\\n\\n## Overview\\n...\\n\\n## Products & Offerings\\n...\\n\\n## Target Audience & Personas\\n...\\n\\n## Core Value Propositions & USPs\\n...\\n\\n## Tone of Voice & Content Angles\\n..."
}`;

    try {
        const rawResponse = await llm.generate({ input: prompt, temperature: 0.2 });
        const cleanJson = String(rawResponse || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        } catch {
            const start = cleanJson.indexOf("{");
            const end = cleanJson.lastIndexOf("}");
            if (start !== -1 && end > start) {
                parsed = JSON.parse(cleanJson.slice(start, end + 1));
            } else {
                throw new Error("Failed to parse brand knowledge JSON");
            }
        }

        const aiProfile = parsed.aiProfile || {};
        aiProfile.name = aiProfile.name || brandName;
        if (!aiProfile.category) aiProfile.category = "E-Commerce & Retail";
        if (!aiProfile.description) aiProfile.description = userDesc;

        let knowledgeMd = parsed.knowledgeMd || "";
        if (!knowledgeMd) {
            knowledgeMd = `# Brand Knowledge Base: ${brandName}\n\n## Overview\n${aiProfile.description}\n\n## Key Offerings\n${(aiProfile.features || []).map(f => `- ${f}`).join("\n")}\n\n## Target Audience\n${(aiProfile.targetAudience || []).map(a => `- ${a}`).join("\n")}`;
        }

        // Attach knowledgeMd to aiProfile for downstream agent context
        aiProfile.knowledgeMd = knowledgeMd;
        aiProfile.websiteSummary = aiProfile.websiteSummary || (websiteText ? `Analyzed ${websiteUrl}: ${aiProfile.description.slice(0, 160)}` : "");

        // Save physical Markdown file to backend/knowledge
        const safeFilename = `${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "brand"}-knowledge.md`;
        const filePath = path.join(KNOWLEDGE_DIR, safeFilename);
        try {
            fs.writeFileSync(filePath, knowledgeMd, "utf8");
            console.log(`[websiteService] Saved knowledge MD to ${filePath}`);
        } catch (e) {
            console.warn(`[websiteService] Could not write knowledge file:`, e.message);
        }

        const chunks = chunkKnowledge({
            markdown: knowledgeMd,
            aiProfile,
            brandName,
        });

        return {
            aiProfile,
            knowledgeMd,
            chunks,
            websiteSummary: aiProfile.websiteSummary,
            filePath,
        };
    } catch (err) {
        console.error("[websiteService] LLM analysis failed:", err);
        // Fallback profile if LLM fails
        const fallbackProfile = {
            name: brandName,
            category: "General",
            description: userDesc || `Brand website: ${websiteUrl}`,
            features: [brandName],
            benefits: ["Quality products and services"],
            uses: ["Social media marketing"],
            targetAudience: ["General public", "Customers"],
            price: { amount: 0, currency: "INR" },
            positioning: `${brandName} official brand`,
            keywords: [brandName.toLowerCase(), "brand", "products"],
            websiteSummary: websiteText ? `Scraped website content from ${websiteUrl}` : "",
        };
        const fallbackMd = `# Brand Knowledge Base: ${brandName}\n\n## Description\n${userDesc}\n\n## Website\n${websiteUrl || "None"}`;
        fallbackProfile.knowledgeMd = fallbackMd;
        const fallbackChunks = chunkKnowledge({
            markdown: fallbackMd,
            aiProfile: fallbackProfile,
            brandName,
        });
        return {
            aiProfile: fallbackProfile,
            knowledgeMd: fallbackMd,
            chunks: fallbackChunks,
            websiteSummary: fallbackProfile.websiteSummary,
            filePath: null,
        };
    }
}

module.exports = {
    crawlWebsite,
    extractTextFromHtml,
    buildBrandKnowledge,
};
