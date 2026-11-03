// ─────────────────────────────────────────────────────────────
// YouTubeThumbnailAgent.js — Dedicated AI YouTube Thumbnail Generator
// Specially engineered for high click-through rate (CTR) YouTube thumbnails.
// Completely distinct from Instagram ad product layouts.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../llm/factory/LLMFactory");

const THUMBNAIL_ARCHETYPES = {
    "viral-shock": {
        name: "Viral Shock & Reaction",
        desc: "Exaggerated emotion, intense facial expression, high contrast neon back-light",
        visualStyle: "hyper-expressive, high drama, dramatic rim lighting, vibrant saturated background, ultra-sharp 8k, cinematic depth of field",
        textHint: "SHOCKING REACTION or UNBELIEVABLE FACT (2-4 words max)",
        defaultColor: "#FFE600", // High-visibility YouTube Yellow
    },
    "versus-comparison": {
        name: "Versus & Comparison",
        desc: "Split-screen before/after, cheap vs expensive, old vs new with clear division",
        visualStyle: "split-screen composition, contrasting dual lighting (warm orange vs cool cyan), dramatic visual comparison, crisp 3D detail",
        textHint: "VS, OLD vs NEW, or BEFORE & AFTER (2-3 words)",
        defaultColor: "#FF2B00", // Vivid Alert Red
    },
    "secret-reveal": {
        name: "Curiosity & Secret Reveal",
        desc: "Spotlight on a hidden detail, mysterious glow, question or magnifying element",
        visualStyle: "moody atmospheric lighting, intense focal spotlight, glowing mystery element, dark moody vignette with neon accents",
        textHint: "SECRET REVEALED or DON'T DO THIS (2-4 words)",
        defaultColor: "#00F0FF", // Neon Cyan
    },
    "cinematic-epic": {
        name: "Cinematic 3D & Tech",
        desc: "Glossy futuristic rendering, dramatic perspective, floating particles, laser accents",
        visualStyle: "3D octane render style, dramatic low-angle perspective, dynamic lighting, glowing laser edges, floating embers, hyper-detailed",
        textHint: "10X FASTER or THE TRUTH (2-3 words)",
        defaultColor: "#FFFFFF", // Crisp White
    },
};

const parseJson = (text) => {
    if (typeof text !== "string") return text;
    const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
        throw new Error("LLM returned invalid JSON for thumbnail concept");
    }
};

/**
 * Plan YouTube Thumbnail visual prompt & punchy overlay text
 */
const planYouTubeThumbnail = async ({
    userPrompt = "",
    videoTitle = "",
    archetype = "viral-shock",
    productProfile = {},
    llm = LLMFactory.create(),
} = {}) => {
    const arch = THUMBNAIL_ARCHETYPES[archetype] || THUMBNAIL_ARCHETYPES["viral-shock"];
    const brandName = productProfile?.name || "";
    const coreConcept = userPrompt || videoTitle || `Exciting YouTube video about ${brandName || "modern tech"}`;

    const prompt = `You are a world-class YouTube Thumbnail Designer and Viral Strategist (like MrBeast, Veritaseum, and Ali Abdaal thumbnail teams).
Design an extreme CTR YouTube Thumbnail concept for this video:

Video Title / Concept: "${coreConcept}"
Brand / Subject: "${brandName || "Creator"}"
Thumbnail Archetype: "${arch.name}" (${arch.desc})

RULES FOR YOUTUBE THUMBNAILS:
1. YouTube thumbnails are NOT Instagram ads.
   - Do NOT include any product sales copy, sublines, disclaimers, or "Shop Now" buttons.
   - Do NOT include tiny brand logos in the corner.
2. OVERLAY TEXT:
   - Must be 2 TO 4 WORDS MAXIMUM.
   - Must create an irresistible curiosity gap or extreme emotion (e.g., "NEVER DO THIS!", "10X FASTER", "I WAS WRONG", "THE SECRET", "DON'T BUY!").
   - Must be in ALL CAPS.
3. VISUAL PROMPT:
   - Must describe a high-impact, clean, uncluttered visual with ONE clear focal subject on one side, and negative space on the other side for the bold text.
   - Lighting: ${arch.visualStyle}.

Return a JSON object with this exact structure:
{
  "overlayText": "2-4 WORDS ALL CAPS",
  "visualPrompt": "Detailed visual description for the image generation model. Include subject, expression/angle, lighting, background colors, and note to leave clean space on the left/right for text.",
  "recommendedColor": "${arch.defaultColor}",
  "textPosition": "left"
}

Return ONLY raw valid JSON. No markdown backticks.`;

    try {
        const text = await llm.generate({ input: prompt, temperature: 0.7 });
        const parsed = parseJson(text);
        return {
            overlayText: String(parsed.overlayText || "WATCH THIS").toUpperCase().slice(0, 30),
            visualPrompt: parsed.visualPrompt || coreConcept,
            recommendedColor: parsed.recommendedColor || arch.defaultColor,
            textPosition: parsed.textPosition || "left",
            archetype,
        };
    } catch {
        // Safe fallback
        return {
            overlayText: (videoTitle ? videoTitle.split(" ").slice(0, 3).join(" ") : "MUST WATCH").toUpperCase(),
            visualPrompt: `High CTR YouTube thumbnail, ${coreConcept}, ${arch.visualStyle}, cinematic lighting, 8k, vibrant colors`,
            recommendedColor: arch.defaultColor,
            textPosition: "left",
            archetype,
        };
    }
};

module.exports = {
    THUMBNAIL_ARCHETYPES,
    planYouTubeThumbnail,
};

