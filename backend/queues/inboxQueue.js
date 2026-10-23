// ─────────────────────────────────────────────────────────────
// queues/inboxQueue.js — AI Message Queue
//
// OPTIMIZATION #3: Improved responsiveness — Backend acknowledges
// webhook immediately (HTTP 200 in ~20ms), while AI analysis and reply
// generation happen asynchronously via BullMQ workers.
//
// OPTIMIZATION #4: Independent scalability — AI workers and Socket.IO
// servers scale independently under high message volume.
// ─────────────────────────────────────────────────────────────
const { bullmq, createConnection, available, QUEUE_PREFIX } = require("./connection");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { analyzeAndGenerateReply } = require("../services/inbox/inboxAiAgent");
const { sendInstagramReply } = require("../services/inbox/instagramMessagingService");
const { notifyDashboard } = require("../services/inbox/socketService");

const INBOX_QUEUE_NAME = "inbox-ai-queue";

let queueInstance = null;

/**
 * Initialize or get BullMQ Inbox Queue
 */
function getInboxQueue() {
  if (queueInstance) return queueInstance;
  if (!available()) return null;

  try {
    const conn = createConnection("queue");
    if (!conn) return null;

    queueInstance = new bullmq.Queue(INBOX_QUEUE_NAME, {
      connection: conn,
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    // Start an embedded worker in the API process so jobs execute even without separate terminal
    if (!process.env.NO_INLINE_WORKER) {
      const workerConn = createConnection("worker");
      if (workerConn) {
        new bullmq.Worker(
          INBOX_QUEUE_NAME,
          async (job) => {
            console.log(`[InlineWorker] Processing inbox job ${job.id}`);
            return processInboxJob(job.data);
          },
          { connection: workerConn, prefix: QUEUE_PREFIX, concurrency: 2 }
        );
        console.log(`[InboxQueue] Inline BullMQ worker active on ${INBOX_QUEUE_NAME}`);
      }
    }

    return queueInstance;
  } catch (err) {
    console.warn(`[InboxQueue] BullMQ init failed: ${err.message}`);
    return null;
  }
}

/**
 * Core processing logic executed by worker or in-memory fallback
 */
async function processInboxJob(jobData) {
  const { conversationId, messageId, text, senderName, senderId, platform, autoReplyEnabled } = jobData;
  console.log(`[InboxQueue] Processing message for ${senderName} (${platform}): "${text.slice(0, 40)}..."`);

  // 1. AI Analysis & Suggested Reply
  const aiResult = await analyzeAndGenerateReply({
    text,
    senderName,
    platform,
  });

  // 2. Fetch conversation from DB
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    console.warn(`[InboxQueue] Conversation ${conversationId} not found`);
    return;
  }

  // 3. Update Conversation with AI classification
  conversation.intent = aiResult.intent;
  conversation.sentiment = aiResult.sentiment;
  conversation.tag = aiResult.tag;
  conversation.priority = aiResult.priority;
  conversation.aiSuggestedReply = aiResult.suggestedReply;
  conversation.aiConfidence = aiResult.aiConfidence;

  let aiReplyMessage = null;

  // 4. Auto-Reply if allowed by AI rules & brand settings
  if (autoReplyEnabled && aiResult.canAutoReply) {
    console.log(`[InboxQueue] Auto-replying to ${senderId} (${platform})...`);
    const sendResult = await sendInstagramReply(senderId, aiResult.suggestedReply, platform);

    aiReplyMessage = await Message.create({
      conversationId: conversation._id,
      senderId: "sociva_brand_ai",
      senderType: "ai",
      text: aiResult.suggestedReply,
      mid: sendResult.messageId || `mid_ai_${Date.now()}`,
      aiGenerated: true,
      status: "sent",
    });

    conversation.autoReplied = true;
    conversation.lastMessageText = aiResult.suggestedReply;
    conversation.lastMessageAt = new Date();
  } else if (!aiResult.canAutoReply && aiResult.sentiment === "sales") {
    // Escalated to human sales
    conversation.status = "escalated";
  }

  await conversation.save();

  // 5. Emit Socket.IO event ONLY after filtering and AI processing complete
  // (Reduced Socket.IO traffic: dashboard gets the enriched, ready-to-display conversation)
  notifyDashboard("inbox:message_processed", {
    conversationId: conversation._id,
    conversation,
    messageId,
    aiResult,
    autoReplied: Boolean(aiReplyMessage),
    aiReply: aiReplyMessage,
  });

  console.log(`[InboxQueue] Completed processing conversation ${conversation._id}`);
  return { conversation, aiResult, aiReplyMessage };
}

/**
 * Add a message job to the queue
 */
async function enqueueInboxMessage(jobData) {
  const q = getInboxQueue();
  if (q) {
    try {
      const job = await q.add("process-message", jobData);
      console.log(`[InboxQueue] Enqueued message job ${job.id}`);
      return { queued: true, jobId: job.id };
    } catch (err) {
      console.warn(`[InboxQueue] Redis queue add failed (${err.message}). Running via fallback.`);
    }
  }

  // Fallback: asynchronous in-memory execution (does not block HTTP response)
  setImmediate(async () => {
    try {
      await processInboxJob(jobData);
    } catch (err) {
      console.error(`[InboxQueue] Fallback processing failed:`, err);
    }
  });

  return { queued: true, fallback: true };
}

module.exports = {
  INBOX_QUEUE_NAME,
  getInboxQueue,
  enqueueInboxMessage,
  processInboxJob,
};
