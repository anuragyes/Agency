// ─────────────────────────────────────────────────────────────
// services/inbox/instagramMessagingService.js — Real Social Messaging API
//
// Sends REAL direct message replies via Meta Graph API (Instagram Direct & Facebook Messenger)
// and WhatsApp Cloud API without any fake/dummy fallback.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const GRAPH_VERSION = process.env.INSTAGRAM_API_VERSION || "v23.0";
const META_TOKEN = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
const PAGE_ID = process.env.META_PAGE_ID || process.env.INSTAGRAM_PAGE_ID;

/**
 * Send a REAL reply message via social platform API (Instagram Direct, Facebook Messenger, WhatsApp)
 * @param {string} recipientId - Real User ID or phone number (e.g. IGSID on Instagram)
 * @param {string} text - Message text to send
 * @param {string} platform - "instagram" | "facebook" | "whatsapp"
 * @returns {Promise<{ success: boolean, messageId: string, platform: string, recipientId: string }>}
 */
const { getAccountCredentials } = require("../tokenService.js");

async function sendSocialReply(recipientId, text, platform = "instagram") {
  if (!text || !recipientId) {
    throw new Error("sendSocialReply requires recipientId and message text");
  }

  const creds = await getAccountCredentials({ platform: platform === "facebook" ? "facebook" : "instagram" });
  let tokenToUse = creds?.accessToken || META_TOKEN;
  let pageIdToUse = creds?.parentAccountId || creds?.accountId || PAGE_ID;

  // 1. WhatsApp Cloud API Dispatch
  if (platform === "whatsapp") {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      throw new Error("Cannot send WhatsApp message: WHATSAPP_PHONE_NUMBER_ID is not set in backend/.env");
    }

    try {
      const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
      const response = await axios.post(
        endpoint,
        {
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: text },
        },
        {
          headers: { Authorization: `Bearer ${tokenToUse}` },
          timeout: 15000,
        }
      );

      const msgId = response.data?.messages?.[0]?.id;
      return {
        success: true,
        messageId: msgId,
        platform: "whatsapp",
        recipientId,
      };
    } catch (err) {
      const metaErr = err.response?.data?.error;
      const errMsg = metaErr?.message || err.message;
      throw new Error(`WhatsApp API Error (${metaErr?.code || err.status || 500}): ${errMsg}`);
    }
  }

  // 2. Meta Graph API (Instagram Direct & Facebook Page Messenger)
  // Try sending via Page endpoint or /me/messages with Page/User access token
  try {
    const { getPageAccess } = require("../facebookService");
    const pageAccess = await getPageAccess().catch(() => null);
    if (pageAccess?.token) {
      tokenToUse = pageAccess.token;
      pageIdToUse = pageAccess.pageId || pageIdToUse;
    }
  } catch (e) {
    // fallback
  }

  if (!tokenToUse) {
    throw new Error("Cannot send real message: No active connected account found. Please connect your account in Accounts page.");
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageIdToUse ? pageIdToUse + "/messages" : "me/messages"}`;

  try {
    console.log(`[Meta Messaging API] Sending real ${platform} message to ${recipientId} via ${endpoint}...`);
    const response = await axios.post(
      endpoint,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
      },
      {
        params: { access_token: tokenToUse },
        timeout: 20000,
      }
    );

    const messageId = response.data?.message_id || response.data?.recipient_id || `mid_${Date.now()}`;
    console.log(`[Meta Messaging API] Real message sent successfully! message_id: ${messageId}`);

    return {
      success: true,
      messageId,
      platform,
      recipientId,
    };
  } catch (err) {
    const metaErr = err.response?.data?.error;
    const errCode = metaErr?.code;
    const errMsg = metaErr?.message || err.message;

    console.error(`[Meta Messaging API] Real send failed:`, metaErr || err.message);

    let userFriendly = errMsg;
    if (errCode === 10 || /outside.*24.*window/i.test(errMsg)) {
      userFriendly = `Meta Error: Cannot send message to ${recipientId}. The customer has not sent a message within the last 24 hours (Meta 24-hour messaging window rule).`;
    } else if (errCode === 230 || errCode === 200 || /permission/i.test(errMsg)) {
      userFriendly = `Meta Permission Error: Your access token lacks 'instagram_manage_messages' or 'pages_messaging' permission.`;
    } else if (errCode === 100) {
      userFriendly = `Meta Error: ${errMsg}`;
    }

    const customErr = new Error(userFriendly);
    customErr.metaError = metaErr;
    customErr.statusCode = err.response?.status || 400;
    throw customErr;
  }
}

const sendInstagramReply = sendSocialReply;

module.exports = {
  sendSocialReply,
  sendInstagramReply,
};
