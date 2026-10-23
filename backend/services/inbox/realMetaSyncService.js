// ─────────────────────────────────────────────────────────────
// services/inbox/realMetaSyncService.js — Real Meta/Instagram Sync
//
// Fetches real conversations and messages from Meta Graph API
// for the connected Instagram Professional Account and Page.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const { analyzeAndGenerateReply, heuristicAnalysis } = require("./inboxAiAgent");
const { getAccountCredentials } = require("../tokenService.js");

const GRAPH_VERSION = process.env.INSTAGRAM_API_VERSION || "v23.0";
const META_TOKEN = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.META_INSTAGRAM_USER_ID || process.env.INSTAGRAM_PAGE_ID;

/**
 * Remove fake demo/seed conversations from database
 */
async function clearDummySeedData() {
  const dummyNames = [
    "Jessica Morales",
    "Daniel Kim",
    "@growthwithpriya",
    "Marcus Chen",
    "Emma Wilson",
    "Olivia Brown",
    "Ryan Patel",
    "Sofia Garcia",
    "Liam Turner",
  ];
  const oldConvs = await Conversation.find({
    $or: [
      { senderName: { $in: dummyNames } },
      { senderId: { $regex: /^sim_user_|^ig_user_|^li_user_|^x_user_|^tk_user_/ } },
    ],
  });
  const oldIds = oldConvs.map((c) => c._id);
  if (oldIds.length > 0) {
    await Message.deleteMany({ conversationId: { $in: oldIds } });
    await Conversation.deleteMany({ _id: { $in: oldIds } });
  }
  console.log(`[RealSync] Cleared ${oldIds.length} dummy/simulated conversations.`);
}

/**
 * Fetch and sync REAL Instagram direct message threads from Meta Graph API
 */
async function syncRealInstagramConversations() {
  const creds = await getAccountCredentials({ platform: "instagram" });
  const token = creds?.accessToken || META_TOKEN;
  const accountId = creds?.accountId || INSTAGRAM_ACCOUNT_ID;

  if (!token) {
    throw new Error("No active Instagram account connected. Please connect your account in Accounts page.");
  }
  if (!accountId) {
    throw new Error("No Instagram account ID found. Please connect your account in Accounts page.");
  }

  console.log(`[RealSync] Fetching real Instagram conversations for account ${accountId}...`);

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/conversations`;
  const response = await axios.get(endpoint, {
    params: {
      platform: "instagram",
      access_token: token,
      fields: "id,updated_time,participants,messages{id,message,created_time,from}",
    },
    timeout: 25000,
  });

  const rawThreads = response.data?.data || [];
  console.log(`[RealSync] Found ${rawThreads.length} real Instagram conversation threads on Meta API`);

  const syncedConversations = [];

  for (const thread of rawThreads) {
    // 1. Identify the external user (the customer / chatting user, not our brand)
    const participants = thread.participants?.data || [];
    const customer =
      participants.find((p) => String(p.id) !== String(INSTAGRAM_ACCOUNT_ID)) ||
      participants[0] ||
      { id: thread.id, username: "Instagram User" };

    const rawMessages = thread.messages?.data || [];
    // Sort oldest to newest
    rawMessages.sort((a, b) => new Date(a.created_time) - new Date(b.created_time));

    const latestMessage = rawMessages[rawMessages.length - 1];
    const latestText = latestMessage?.message || "(Attachment / Post share)";

    // 2. Find or create real Conversation in MongoDB
    let conversation = await Conversation.findOne({
      platform: "instagram",
      senderId: String(customer.id),
    });

    if (!conversation) {
      conversation = new Conversation({
        externalId: thread.id,
        platform: "instagram",
        senderId: String(customer.id),
        senderName: customer.username ? `@${customer.username}` : `User_${customer.id}`,
        senderRole: "Instagram User",
        lastMessageText: latestText,
        lastMessageAt: latestMessage ? new Date(latestMessage.created_time) : new Date(thread.updated_time),
        unread: false,
      });

      // Fast AI classification for intent and suggested reply
      try {
        if (latestText && latestText !== "(Attachment / Post share)") {
          const ai = heuristicAnalysis(latestText, customer.username || "Friend");
          conversation.intent = ai.intent;
          conversation.sentiment = ai.sentiment;
          conversation.tag = ai.tag;
          conversation.priority = ai.priority;
          conversation.aiSuggestedReply = ai.suggestedReply;
          conversation.aiConfidence = 92;
        }
      } catch (aiErr) {
        console.warn(`[RealSync] AI analysis note:`, aiErr.message);
      }

      await conversation.save();
    } else {
      conversation.lastMessageText = latestText;
      conversation.lastMessageAt = latestMessage ? new Date(latestMessage.created_time) : new Date(thread.updated_time);
      await conversation.save();
    }

    // 3. Upsert real messages
    for (const m of rawMessages) {
      const isBrand = String(m.from?.id) === String(INSTAGRAM_ACCOUNT_ID);
      const textContent = m.message || "(Attachment / Post share)";

      const existing = await Message.findOne({ mid: m.id });
      if (!existing) {
        await Message.create({
          conversationId: conversation._id,
          senderId: String(m.from?.id || customer.id),
          senderType: isBrand ? "brand" : "user",
          text: textContent,
          mid: m.id,
          status: "processed",
          createdAt: new Date(m.created_time),
        });
      }
    }

    syncedConversations.push(conversation);
  }

  console.log(`[RealSync] Successfully synced ${syncedConversations.length} real conversations.`);
  return syncedConversations;
}

module.exports = {
  syncRealInstagramConversations,
  clearDummySeedData,
};
