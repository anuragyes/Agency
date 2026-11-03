// ─────────────────────────────────────────────────────────────
// YouTubePostAgent.js — AI YouTube Content & Packaging Generator
// Generates CTR-optimized titles, video opening hooks (first 3 sec),
// SEO descriptions with timestamped chapters, tags, and AI thumbnail concepts.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../../../llm/factory/LLMFactory");

const parseJson = (text) => {
    if (typeof text !== "string") return text;
    const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
        throw new Error("LLM returned invalid JSON for YouTube post");
    }
};

const buildYouTubePrompt = ({ brief, contentType, userPrompt, previousContent }) => {
    const isShort = contentType === "short";
    const brandName = brief?.product?.name || "Our Brand";
    const audience = brief?.audience || "YouTube audience";
    const coreFacts = Array.isArray(brief?.facts) ? brief.facts.join("\n- ") : "";

    return `You are a YouTube viral strategist and YouTube SEO algorithm expert.
Your job is to package a high-converting, high-retention ${isShort ? "YouTube Short (Vertical 9:16)" : "YouTube Standard Video (Horizontal 16:9)"}.

Product / Brand: ${brandName}
Target Audience: ${audience}
Key Facts & Benefits:
- ${coreFacts}

User Video Concept / Prompt:
"${userPrompt || brief?.optimizedPrompt || "Create an engaging, viral YouTube video about this product."}"

${previousContent ? `Previous Content to Revise:
${JSON.stringify(previousContent, null, 2)}
` : ""}

Generate a JSON object with this EXACT structure:
{
  "title": "Main winning title under 70 characters (CTR-focused, no clickbait that breaks trust)",
  "titleAlternatives": [
    "Search SEO angle (e.g. How to...)",
    "Curiosity / Story angle (e.g. Why I stopped...)",
    "Direct value angle (e.g. Top 3 secrets...)"
  ],
  "hooks": [
    "Hook 1: Visual + Spoken opening line (0-3 sec)",
    "Hook 2: Counter-intuitive question opening",
    "Hook 3: High-energy problem statement"
  ],
  "description": "Engaging first 2 lines for search preview, followed by value summary and call to action.",
  "chapters": [
    { "time": "0:00", "title": "The Big Problem" },
    { "time": "0:15", "title": "The Secret Solution" },
    { "time": "0:45", "title": "How to Get Started" }
  ],
  "tags": [
    "keyword1",
    "keyword2",
    "keyword3",
    "keyword4",
    "keyword5"
  ],
  "visual": {
    "brief": "Detailed prompt to generate a clickable thumbnail in our AI image generator (specify subject, lighting, vibrant colors, expressive action)",
    "onImageText": "3 to 4 punchy capital words to overlay on thumbnail (e.g. STOP DOING THIS!)",
    "style": "photorealistic, cinematic lighting, 8k"
  },
  "categoryId": "22",
  "privacyStatus": "public"
}

Return ONLY valid JSON. No conversational text, no markdown backticks.`;
};

const generateYouTubePost = async ({
    brief = null,
    productProfile = null,
    contentType = "short",
    userPrompt = "",
    previousContent = null,
    stats = {},
    llm = LLMFactory.create(),
} = {}) => {
    const useBrief = brief || {
        product: { name: productProfile?.name || "Product" },
        audience: productProfile?.targetAudience || "General Audience",
        facts: [productProfile?.description, ...(productProfile?.benefits || [])].filter(Boolean),
        optimizedPrompt: userPrompt,
    };

    const prompt = buildYouTubePrompt({
        brief: useBrief,
        contentType,
        userPrompt,
        previousContent,
    });

    const rawText = await llm.generate({
        input: prompt,
        temperature: previousContent ? 0.6 : 0.7,
    });

    if (llm.lastUsage) {
        stats.promptTokens = (stats.promptTokens || 0) + (llm.lastUsage.prompt_tokens || 0);
        stats.completionTokens = (stats.completionTokens || 0) + (llm.lastUsage.completion_tokens || 0);
    } else {
        stats.promptTokens = (stats.promptTokens || 0) + Math.ceil(prompt.length / 4);
        stats.completionTokens = (stats.completionTokens || 0) + Math.ceil(String(rawText || "").length / 4);
    }

    const parsed = parseJson(rawText);

    // Enforce limits & cleanups
    parsed.title = (parsed.title || "New YouTube Video").slice(0, 100);
    parsed.tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 15) : [];
    parsed.hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
    parsed.chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    if (!parsed.hook && parsed.hooks.length > 0) {
        parsed.hook = parsed.hooks[0];
    } else if (parsed.hook && !parsed.hooks.length) {
        parsed.hooks = [parsed.hook];
    }

    return {
        data: parsed,
        usage: stats,
    };
};

module.exports = { generateYouTubePost };

