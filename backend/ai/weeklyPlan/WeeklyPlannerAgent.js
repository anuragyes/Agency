// ─────────────────────────────────────────────────────────────
// WeeklyPlannerAgent.js — 7-Day Social Media Strategy Director
// Combines strategic 4:2:1 pacing, format alternation, and
// active Brand Brain (RAG) context into a cohesive 7-day content plan.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../llm/factory/LLMFactory");
const ragService = require("../../services/ragService.js");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parseJson = (text) => {
  if (typeof text !== "string") return text;
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s !== -1 && e > s) return JSON.parse(t.slice(s, e + 1));
    const arrS = t.indexOf("[");
    const arrE = t.lastIndexOf("]");
    if (arrS !== -1 && arrE > arrS) return JSON.parse(t.slice(arrS, arrE + 1));
    throw new Error("WeeklyPlannerAgent returned invalid JSON");
  }
};

async function generateWeeklyPlan({
  productId,
  productProfile = {},
  campaignGoal = "Engagement & Brand Growth",
  platforms = ["instagram"],
  weekStartDate = new Date(),
  customPrompt = "",
}) {
  const brandName = productProfile.name || "Brand";
  const category = productProfile.category || "General";
  const audience = productProfile.audience || "Target customers & followers";
  const tone = productProfile.tone || "Professional, engaging, authentic";
  const primaryPlatform = platforms[0] || "instagram";

  // Build the 7 continuous days starting from the requested weekStartDate
  const start = new Date(weekStartDate);
  start.setHours(0, 0, 0, 0);

  const continuousDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    continuousDays.push({
      date: d,
      dayName: DAY_NAMES[d.getDay()],
      dayOffset: i,
    });
  }

  const startDayName = continuousDays[0].dayName;
  const endDayName = continuousDays[6].dayName;
  const sequenceStr = continuousDays.map((c) => `${c.dayName} (Day ${c.dayOffset + 1})`).join(" -> ");

  // 1. Retrieve RAG chunks for the brand catalog & facts
  let ragContext = "";
  if (productId) {
    try {
      const rag = await ragService.retrieveContext({
        productId,
        userPrompt: `${campaignGoal} ${customPrompt} weekly content strategy products features`,
        topK: 3,
      });
      ragContext = rag?.contextText || "";
    } catch (e) {
      console.warn("[WeeklyPlannerAgent] RAG fallback:", e.message);
    }
  }

  const systemInstruction = `You are an elite Social Media Director and Content Strategist.
Your job is to design a high-converting, viral 7-Day Content Sprint for a brand.

BRAND PROFILE:
- Brand Name: ${brandName}
- Industry/Category: ${category}
- Target Audience: ${audience}
- Tone of Voice: ${tone}
- Primary Platforms: ${platforms.join(", ")}
- Weekly Campaign Goal: ${campaignGoal}

${ragContext ? `BRAND KNOWLEDGE & PRODUCT CATALOG (RAG FACTS):\n${ragContext}\n` : ""}

CRITICAL STRATEGY RULES:
1. Pacing & Variety (The 4:2:1 Rule):
   - 4 Value & Educational posts (Actionable tips, step-by-step guides, myth busters)
   - 2 Community & Culture posts (Behind the scenes, questions, relatable reels/videos)
   - 1 High-converting Sales/Product spotlight (Product feature, social proof, limited offer)
2. Format Alternation:
   - NEVER use the exact same format two days in a row!
   - Distribute between "image" (Single photo/graphic), "carousel" (multi-slide swipeable guide), and "reel" (short video/story).
3. Grounded in Brand Truth:
   - Use the brand's actual product lines, features, and value props. Do NOT invent generic buzzwords.
4. Output Format:
   - Return a valid JSON object with a "days" array of exactly 7 items covering the 7 continuous days in order:
     ${sequenceStr}.
   - Each item must strictly follow the schema:
     {
       "dayName": "...", // e.g. "${startDayName}"
       "dayOffset": 0, // 0 to 6
       "time": "10:00",
       "platform": "${primaryPlatform}",
       "format": "image", // "image" | "carousel" | "reel"
       "topic": "Punchy headline for the post",
       "hook": "Attention-grabbing 1st sentence hook",
       "captionPrompt": "Brief instructions on what the caption should cover",
       "imagePrompt": "Master commercial advertising visual prompt (60-120 words). Describe ONLY the photographic scene, hero product placement, materials, lighting (rim light, natural morning sun, soft studio diffusion), textures, background environment, and camera depth-of-field. ABSOLUTELY ZERO TEXT: Do NOT include headlines, copy, slogans, quotes, labels, words, or text instructions in this prompt. The typography is overlaid separately by the system.",
       "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
     }`;

  const userInput = `Plan the next 7 continuous days of social media content starting on ${startDayName} (${continuousDays[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}) through ${endDayName} (${continuousDays[6].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}).
Day sequence: ${sequenceStr}.
${customPrompt ? `Additional User Focus: "${customPrompt}"` : ""}
Create an engaging, cohesive weekly narrative that drives audience growth and engagement. Output JSON.`;

  const llm = LLMFactory.create();
  const rawResponse = await llm.generate({
    systemInstruction,
    input: userInput,
    temperature: 0.35,
  });

  const parsed = parseJson(rawResponse);
  const rawDays = Array.isArray(parsed) ? parsed : parsed.days || parsed.slots || [];

  // Map to normalized slots with exact dates matching the 7 continuous days
  const slots = continuousDays.map((dayInfo, index) => {
    const raw =
      rawDays.find(
        (d) =>
          d.dayOffset === index ||
          (d.dayName || "").toLowerCase() === dayInfo.dayName.toLowerCase()
      ) ||
      rawDays[index] ||
      {};

    const defaultTimes = ["10:00", "14:30", "18:00", "11:00", "16:00", "12:30", "19:00"];
    const format = ["image", "carousel", "reel", "text", "video"].includes(raw.format)
      ? raw.format
      : (index % 2 === 0 ? "image" : "carousel");
    const chosenPlatform = platforms.includes(raw.platform) ? raw.platform : primaryPlatform;

    return {
      slotId: `${dayInfo.dayName.slice(0, 3).toLowerCase()}-1`,
      dayName: dayInfo.dayName,
      date: dayInfo.date,
      time: raw.time || defaultTimes[index] || "10:00",
      platform: chosenPlatform,
      format,
      topic: raw.topic || `${brandName} Tip #${index + 1}`,
      hook: raw.hook || `Discover the secret behind ${brandName}.`,
      imagePrompt: raw.imagePrompt || `Modern commercial photography for ${brandName}, high-end lighting, aesthetic setting, 8k resolution`,
      caption: "",
      hashtags: Array.isArray(raw.hashtags) && raw.hashtags.length ? raw.hashtags : [brandName.toLowerCase().replace(/\s+/g, ""), "trending", "explore"],
      mediaUrls: [],
      status: "blueprint",
      isApproved: false,
    };
  });

  return {
    campaignGoal,
    platforms,
    weekStartDate: start,
    weekEndDate: continuousDays[6].date,
    slots,
  };
}

module.exports = { generateWeeklyPlan };

