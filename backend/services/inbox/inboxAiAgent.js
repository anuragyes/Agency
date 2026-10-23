// ─────────────────────────────────────────────────────────────
// services/inbox/inboxAiAgent.js — AI Worker Agent
//
// Analyzes incoming relevant customer messages:
// - Sentiment & Intent scoring (0-100)
// - Smart Tagging (Sales, Issue, Question, Positive)
// - On-brand AI Suggested Reply generation
// - Auto-reply eligibility assessment (escalates high-value/sensitive issues)
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../llm/factory/LLMFactory");
const Product = require("../../models/Product");

/**
 * Heuristic fallback in case LLM is unreachable or timed out
 */
function heuristicAnalysis(text, senderName = "Friend") {
  const lower = text.toLowerCase();
  const firstName = (senderName || "there").split(" ")[0];

  if (/\b(demo|price|pricing|cost|quote|buy|enterprise|seats|upgrade|sign up)\b/i.test(lower)) {
    return {
      sentiment: "sales",
      intent: 88,
      tag: ["amber", "Sales"],
      priority: "high",
      suggestedReply: `Hi ${firstName}! Thanks for reaching out. We'd love to show you a quick demo and discuss pricing tailored to your team. Let us know what time works best for you! 🙌`,
      canAutoReply: false, // Sales demos are escalated to a human by default!
      escalationReason: "Demo/Pricing request routed to sales human agent",
    };
  }

  if (/\b(broken|bug|error|not working|fail|problem|issue|worst|terrible|awful|refund|stuck)\b/i.test(lower)) {
    return {
      sentiment: "issue",
      intent: 35,
      tag: ["red", "Issue"],
      priority: "high",
      suggestedReply: `Hi ${firstName}, so sorry to hear you're running into trouble. We're actively looking into this. Could you share a quick screenshot or more details so we can resolve it immediately?`,
      canAutoReply: false, // Critical issues escalated to human support
      escalationReason: "Customer issue flagged for human team review",
    };
  }

  if (/\b(love|awesome|great|amazing|fire|🔥|super|best|thank|thanks|congrats)\b/i.test(lower)) {
    return {
      sentiment: "positive",
      intent: 45,
      tag: ["green", "Positive"],
      priority: "normal",
      suggestedReply: `Thanks so much, ${firstName}! 💜 We really appreciate the support and kind words. Let us know if you ever need anything!`,
      canAutoReply: true,
      escalationReason: null,
    };
  }

  return {
    sentiment: "question",
    intent: 50,
    tag: ["blue", "Question"],
    priority: "normal",
    suggestedReply: `Hi ${firstName}! Thanks for your message. How can we best help you today?`,
    canAutoReply: true,
    escalationReason: null,
  };
}

/**
 * Process a message with LLM to generate deep intent analysis and an on-brand reply
 */
async function analyzeAndGenerateReply({ text, senderName, platform = "instagram", brandName = "Sociva" }) {
  const firstName = (senderName || "there").split(" ")[0];

  // Try to find brand profile if available
  let brandVoice = "friendly, helpful, professional, and authentic";
  try {
    const product = await Product.findOne().sort({ updatedAt: -1 }).lean();
    if (product) {
      brandName = product.productName || product.name || brandName;
      if (product.brandTone) brandVoice = product.brandTone;
    }
  } catch (err) {
    // continue with defaults
  }

  const systemInstruction = `You are the AI Social Media Inbox Agent for "${brandName}".
Brand voice: ${brandVoice}.
Your task is to analyze the incoming message from a customer/lead and generate:
1. sentiment: exactly one of ["sales", "positive", "negative", "issue", "question", "neutral"]
2. intent: integer score 0 to 100 (high intent > 70 for buying/demo/pricing interest)
3. tag: an array with [color, label]. color must be "amber" for Sales, "red" for Issue/Negative, "green" for Positive, "blue" for Question/Neutral.
4. priority: "high", "normal", or "low"
5. suggestedReply: A warm, concise (1-2 sentences), highly authentic reply on behalf of ${brandName} addressing the customer as ${firstName}. Avoid robotic clichés.
6. canAutoReply: boolean. Return false if the user asks for a sales demo/contract or is very angry, which requires human team intervention. Return true for standard questions, compliments, or routine inquiries.`;

  const input = `Sender Name: ${senderName}
Platform: ${platform}
Message: "${text}"`;

  try {
    const llm = LLMFactory.create();
    const raw = await llm.generate({
      systemInstruction,
      input,
      responseSchema: {
        sentiment: "sales",
        intent: 85,
        tag: ["amber", "Sales"],
        priority: "high",
        suggestedReply: "string",
        canAutoReply: true,
      },
      temperature: 0.3,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (parsed && parsed.suggestedReply) {
      return {
        sentiment: parsed.sentiment || "neutral",
        intent: typeof parsed.intent === "number" ? parsed.intent : 50,
        tag: Array.isArray(parsed.tag) && parsed.tag.length === 2 ? parsed.tag : ["blue", "Question"],
        priority: parsed.priority || "normal",
        suggestedReply: parsed.suggestedReply,
        canAutoReply: Boolean(parsed.canAutoReply),
        aiConfidence: 95,
      };
    }
  } catch (err) {
    console.warn(`[Inbox AI Agent] LLM processing failed, using heuristic fallback:`, err.message);
  }

  // Fallback to heuristic
  const fallback = heuristicAnalysis(text, senderName);
  return {
    ...fallback,
    aiConfidence: 85,
  };
}

module.exports = {
  analyzeAndGenerateReply,
  heuristicAnalysis,
};
