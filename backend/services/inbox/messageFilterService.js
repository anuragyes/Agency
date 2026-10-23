// ─────────────────────────────────────────────────────────────
// services/inbox/messageFilterService.js — Backend Filtering Layer
//
// ARCHITECTURE OPTIMIZATIONS:
// 1. Reduced Socket.IO traffic: Discards noise/receipts/echoes before touching Socket.IO.
// 2. Reduced AI costs: Only actionable customer messages reach LLM workers.
// ─────────────────────────────────────────────────────────────

const SPAM_PATTERNS = [
  /\b(crypto|forex|invest|telegram @|whatsapp \+?\d{8,}|free followers|buy followers|dm to promo)\b/i,
  /https?:\/\/bit\.ly\//i,
];

/**
 * Filter and normalize incoming webhook events from Instagram / WhatsApp / Meta.
 * Returns:
 *   pass: boolean (true = send to AI Queue, false = ignore/drop)
 *   reason: string explanation for logging/telemetry
 *   message: normalized clean object if pass === true
 */
function filterIncomingWebhook(payload, platform = "instagram") {
  if (!payload || typeof payload !== "object") {
    return { pass: false, reason: "Empty or invalid webhook body" };
  }

  // Auto-detect platform from Meta payload object or direct payload
  if (payload.platform) {
    platform = payload.platform;
  } else if (payload.object === "page") {
    platform = "facebook";
  } else if (payload.object === "whatsapp_business_account") {
    platform = "whatsapp";
  } else if (payload.object === "instagram") {
    platform = "instagram";
  }

  // ── 1. Parse Meta/Instagram/Facebook/WhatsApp Webhook standard format ──
  // Meta webhook structure: { object: "instagram" | "page" | "whatsapp_business_account", entry: [...] }
  let messagingItem = null;
  let senderId = null;
  let recipientId = null;
  let text = "";
  let mid = null;
  let isEcho = false;
  let timestamp = Date.now();

  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      // Instagram & Facebook Page Messenger entries
      if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
        messagingItem = entry.messaging[0];
        break;
      }
      // WhatsApp changes entries
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field === "messages" && change.value?.messages?.[0]) {
            const wMsg = change.value.messages[0];
            senderId = wMsg.from;
            text = wMsg.text?.body || "";
            mid = wMsg.id;
            timestamp = wMsg.timestamp ? Number(wMsg.timestamp) * 1000 : Date.now();
            platform = "whatsapp";
            break;
          }
        }
      }
    }
  }

  // Also support direct normalized payload (from simulator or direct adapter)
  if (!messagingItem && payload.senderId && (payload.text !== undefined)) {
    senderId = payload.senderId;
    recipientId = payload.recipientId || "brand_page";
    text = payload.text || "";
    mid = payload.mid || "mid_" + Date.now();
    isEcho = Boolean(payload.isEcho);
    timestamp = payload.timestamp || Date.now();
  } else if (messagingItem) {
    senderId = messagingItem.sender?.id;
    recipientId = messagingItem.recipient?.id;
    timestamp = messagingItem.timestamp || Date.now();

    // Check delivery/read receipts
    if (messagingItem.delivery) {
      return { pass: false, reason: "Delivery receipt notification (ignored)" };
    }
    if (messagingItem.read) {
      return { pass: false, reason: "Read receipt notification (ignored)" };
    }
    if (messagingItem.reaction) {
      return { pass: false, reason: "Emoji reaction (no AI processing needed)" };
    }

    if (messagingItem.message) {
      mid = messagingItem.message.mid;
      isEcho = Boolean(messagingItem.message.is_echo);
      text = messagingItem.message.text || "";
    }
  }

  // ── 2. FILTER: Ignore Echo Messages ──
  // Echo messages occur when the brand sends a reply. Discarding them prevents infinite AI reply loops!
  if (isEcho) {
    return {
      pass: false,
      reason: "Brand echo message (prevented infinite AI reply loop)",
      isEcho: true,
      senderId,
      text,
    };
  }

  // ── 3. FILTER: Missing sender or message ──
  if (!senderId) {
    return { pass: false, reason: "Missing sender identifier" };
  }

  // ── 4. FILTER: Empty text or non-text media without captions ──
  const trimmed = text.trim();
  if (!trimmed) {
    return { pass: false, reason: "Empty message text (no text to analyze)" };
  }

  // ── 5. FILTER: Spam / Promotional Bot Patterns ──
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { pass: false, reason: `Spam filter triggered by pattern: ${pattern}` };
    }
  }

  // ── 6. FILTER: Extremely short noise (e.g. single punctuation or spam letter) ──
  if (trimmed.length < 2 && !/[?0-9a-zA-Z]/.test(trimmed)) {
    return { pass: false, reason: "Low information noise / single punctuation" };
  }

  // ── PASSED FILTER ──
  return {
    pass: true,
    reason: "Relevant incoming customer message",
    normalized: {
      platform,
      senderId,
      recipientId,
      text: trimmed,
      mid,
      timestamp,
      senderName: payload.senderName || `User_${senderId.slice(-4)}`,
      senderRole: payload.senderRole || "Customer",
    },
  };
}

module.exports = {
  filterIncomingWebhook,
};
