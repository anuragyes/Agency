// ─────────────────────────────────────────────────────────────
// Unified Inbox — Real Architecture:
// Webhooks -> Backend Filter -> BullMQ Queue -> AI Worker -> Socket.IO -> Brand Dashboard
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Avatar, Btn, IconBtn, Pill, Toggle, cx, useToast } from "../ui/kit";
import { useWorkspace } from "../store";
import {
  API_BASE,
  getInboxConversations,
  getInboxMessages,
  getInboxStats,
  sendInboxReply,
  toggleInboxAutoReply,
  updateInboxConversation,
  simulateInboxWebhook,
  syncInboxConversations,
} from "../api";

const FOLDERS = [
  ["all", "inbox", "All messages"],
  ["sales", "magnet", "Sales intent"],
  ["neg", "smile", "Issues / Negative"],
  ["high", "flame", "High priority"],
  ["ai", "bot", "Handled by AI"],
];

const PRESET_SIMULATIONS = [
  {
    title: "1. High Intent Sales Demo Request",
    senderName: "Jessica Morales",
    senderRole: "Head of Marketing @ Fernway",
    platform: "instagram",
    text: "Hey! Could we get a quick demo next week? We are an agency managing 14 clients and need pricing for 8 seats.",
    type: "pass",
  },
  {
    title: "2. Product Capability Inquiry",
    senderName: "Marcus Vance",
    senderRole: "E-Commerce Founder",
    platform: "instagram",
    text: "Does Sociva support direct Instagram Reel scheduling and automatic story publishing?",
    type: "pass",
  },
  {
    title: "3. Urgent Customer Bug / Issue",
    senderName: "Liam Turner",
    senderRole: "Verified Customer",
    platform: "instagram",
    text: "The payment checkout link in your bio is broken and showing a 404 error page!",
    type: "pass",
  },
  {
    title: "4. Positive Community Feedback",
    senderName: "@creatorspark",
    senderRole: "Digital Creator",
    platform: "instagram",
    text: "Loving the new AI image generator and hashtag research tool! Total gamechanger 🔥",
    type: "pass",
  },
  {
    title: "5. Filter Test: Brand Echo Message",
    senderName: "Brand Support",
    senderRole: "Brand Page",
    platform: "instagram",
    text: "Thank you for reaching out to Sociva support.",
    isEcho: true,
    type: "filter",
  },
  {
    title: "6. Filter Test: Bot Promo / Spam",
    senderName: "FastBooster_99",
    senderRole: "Unknown",
    platform: "instagram",
    text: "Buy 10,000 real followers cheap! Telegram @fastboosters discount link",
    type: "filter",
  },
];

export default function Inbox() {
  const toast = useToast();
  const { brandName } = useWorkspace();

  // State
  const [folder, setFolder] = useState("all");
  const [chFilter, setChFilter] = useState(null);
  const [q, setQ] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState("");
  const [auto, setAuto] = useState(true);
  const [stats, setStats] = useState({
    autoRepliedToday: 0,
    avgResponseTime: "1m 18s",
    total: 0,
    salesLeads: 0,
  });

  // Socket state
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);

  // Simulator Drawer State
  const [showSimModal, setShowSimModal] = useState(false);
  const [simText, setSimText] = useState("");
  const [simSender, setSimSender] = useState("Alex Rivera");
  const [simPlatform, setSimPlatform] = useState("instagram");
  const [simEcho, setSimEcho] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simFeedback, setSimFeedback] = useState(null);

  // Active conversation object
  const activeConv = useMemo(() => {
    return conversations.find((c) => c._id === activeId) || conversations[0] || null;
  }, [conversations, activeId]);

  // Load stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await getInboxStats();
      if (res?.data) {
        setStats(res.data);
        if (typeof res.data.autoReplyEnabled === "boolean") {
          setAuto(res.data.autoReplyEnabled);
        }
      }
    } catch (err) {
      console.warn("Could not fetch inbox stats:", err.message);
    }
  }, []);

  // Load conversations
  const fetchConversations = useCallback(async (selectFirst = false) => {
    try {
      setLoadingList(true);
      const res = await getInboxConversations({ folder, channel: chFilter, q });
      const items = res?.data || [];
      setConversations(items);
      if (items.length > 0) {
        setActiveId((prev) => (prev && items.some((x) => x._id === prev) ? prev : items[0]._id));
      } else {
        setActiveId(null);
      }
    } catch (err) {
      toast(err.message || "Failed to load conversations", "error");
    } finally {
      setLoadingList(false);
    }
  }, [folder, chFilter, q, toast]);

  // Load messages for active thread
  const fetchMessages = useCallback(async (convId) => {
    if (!convId) {
      setMessages([]);
      return;
    }
    try {
      setLoadingThread(true);
      const res = await getInboxMessages(convId);
      setMessages(res?.data || []);
      // Mark as read in local list
      setConversations((prev) =>
        prev.map((c) => (c._id === convId ? { ...c, unread: false } : c))
      );
    } catch (err) {
      console.warn("Could not fetch messages:", err.message);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations(true);
    fetchStats();
  }, [fetchConversations, fetchStats]);

  // When active conversation changes, load its messages
  useEffect(() => {
    if (activeConv?._id) {
      fetchMessages(activeConv._id);
    }
  }, [activeConv?._id, fetchMessages]);

  // Socket.IO Real-time updates
  useEffect(() => {
    const socketUrl = API_BASE.replace(/\/api$/, "").replace(/\/$/, "");
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected to server:", socket.id);
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[Socket.IO] Disconnected from server");
      setSocketConnected(false);
    });

    // Event 1: AI Worker finished processing a message from the queue
    socket.on("inbox:message_processed", (payload) => {
      console.log("[Socket.IO] inbox:message_processed received:", payload);
      const { conversationId, conversation, aiReply } = payload;

      // Update conversation in list
      setConversations((prev) => {
        const index = prev.findIndex((c) => c._id === conversationId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...conversation };
          // Move to top
          const [moved] = updated.splice(index, 1);
          return [moved, ...updated];
        }
        return [conversation, ...prev];
      });

      // If active conversation matches, update messages & suggestions
      if (activeId === conversationId) {
        if (aiReply) {
          setMessages((m) => [...m, aiReply]);
        }
      }

      fetchStats();
      toast(
        `⚡ Real-time: Processed message from ${conversation?.senderName || "User"} via AI Worker`,
        "success"
      );
    });

    // Event 2: Manual or AI Reply sent
    socket.on("inbox:reply_sent", (payload) => {
      const { conversationId, message, conversation } = payload;
      if (activeId === conversationId && message) {
        setMessages((m) => {
          if (m.some((x) => x._id === message._id)) return m;
          return [...m, message];
        });
      }
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, ...conversation } : c))
      );
      fetchStats();
    });

    // Event 3: Conversation updated
    socket.on("inbox:conversation_updated", (payload) => {
      const { conversationId, conversation } = payload;
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, ...conversation } : c))
      );
    });

    // Event 4: Global settings updated
    socket.on("inbox:settings_updated", (payload) => {
      if (typeof payload.autoReplyEnabled === "boolean") {
        setAuto(payload.autoReplyEnabled);
      }
    });

    // Event 5: Real Meta sync completed
    socket.on("inbox:sync_complete", () => {
      fetchConversations();
      fetchStats();
    });

    return () => {
      socket.disconnect();
    };
  }, [activeId, fetchConversations, fetchStats, toast]);

  // Handle Sync Real DMs directly from Meta Graph API
  const handleSyncRealDMs = async () => {
    setSyncing(true);
    try {
      const res = await syncInboxConversations();
      toast(res.message || "Synced real Instagram conversations! 📥", "success");
      await fetchConversations();
      await fetchStats();
    } catch (err) {
      toast(err.message || "Failed to sync real Instagram conversations", "error");
    } finally {
      setSyncing(false);
    }
  };

  // Handle Toggle Auto-Reply
  const handleToggleAuto = async (newVal) => {
    setAuto(newVal);
    try {
      await toggleInboxAutoReply(newVal);
      toast(`Auto-reply ${newVal ? "enabled" : "disabled"}`, "success");
    } catch (err) {
      setAuto(!newVal);
      toast("Failed to update auto-reply setting", "error");
    }
  };

  // Send Reply (manual or suggestion)
  const handleSend = async (textToSend, isAi = false) => {
    if (!textToSend?.trim() || !activeConv) return;
    setSending(true);
    try {
      const res = await sendInboxReply(activeConv._id, {
        text: textToSend.trim(),
        isAiSuggestion: isAi,
      });
      if (res?.data) {
        setMessages((prev) => [...prev, res.data]);
      }
      setDraft("");
      toast("Reply sent via Instagram Messaging API! 🚀", "success");
      fetchStats();
    } catch (err) {
      toast(err.message || "Failed to send reply", "error");
    } finally {
      setSending(false);
    }
  };

  // Run Webhook Simulation Test
  const handleSimulate = async (customPayload = null) => {
    const payload = customPayload || {
      text: simText,
      senderName: simSender,
      platform: simPlatform,
      isEcho: simEcho,
    };

    if (!payload.text) {
      toast("Please provide message text to simulate", "error");
      return;
    }

    setSimulating(true);
    setSimFeedback(null);
    try {
      const res = await simulateInboxWebhook(payload);
      setSimFeedback(res);
      if (res.filtered) {
        toast(`🛡️ Filtered: ${res.reason}`, "neutral");
      } else {
        toast(`Incoming webhook enqueued to BullMQ AI queue! ⚡`, "success");
        // Refetch list
        setTimeout(() => fetchConversations(), 800);
      }
    } catch (err) {
      toast(err.message || "Simulation failed", "error");
    } finally {
      setSimulating(false);
    }
  };

  // Format timestamp helper
  const formatTime = (dateStr) => {
    if (!dateStr) return "Just now";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <>
      {/* Top Header */}
      <div className="sa-page-head">
        <div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <h1>Unified Inbox</h1>
            <span
              className={cx("sa-pill", socketConnected ? "tone-green" : "tone-amber")}
              style={{ fontSize: 11, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: socketConnected ? "#10b981" : "#f59e0b",
                  boxShadow: socketConnected ? "0 0 8px #10b981" : "none",
                }}
              />
              {socketConnected ? "Socket.IO Live" : "Connecting..."}
            </span>
          </div>
          <p>
            Incoming events triaged by Backend Filtering, dispatched through BullMQ message queues, and updated in real-time.
          </p>
        </div>

        {/* Action Bar & KPI Stats */}
        <div className="row wrap" style={{ gap: 12, alignItems: "center" }}>
          <Btn
            variant="primary"
            icon="refresh"
            disabled={syncing}
            onClick={handleSyncRealDMs}
            style={{ fontWeight: 600 }}
          >
            {syncing ? "Syncing Meta DMs..." : "🔄 Sync Real Instagram DMs"}
          </Btn>

          <Btn
            variant="outline"
            icon="sparkles"
            onClick={() => setShowSimModal(true)}
            style={{ border: "1px solid var(--sa-border)", color: "var(--sa-muted)", fontWeight: 500 }}
          >
            ⚡ Test Webhook
          </Btn>

          <div className="sa-card row" style={{ padding: "10px 18px", gap: 20 }}>
            <div>
              <small className="muted">Auto-replied today</small>
              <div className="strong" style={{ fontSize: 20, fontFamily: "var(--sa-head)" }}>
                {stats.autoRepliedToday || 0}
              </div>
            </div>
            <div style={{ borderLeft: "1px solid var(--sa-border)", paddingLeft: 20 }}>
              <small className="muted">Avg. response</small>
              <div className="strong" style={{ fontSize: 20, fontFamily: "var(--sa-head)" }}>
                {stats.avgResponseTime || "1m 18s"}
              </div>
            </div>
            <div className="row" style={{ borderLeft: "1px solid var(--sa-border)", paddingLeft: 20, gap: 8 }}>
              <Toggle checked={auto} onChange={handleToggleAuto} label="Auto-reply" />
              <b className="strong" style={{ fontSize: 13 }}>Auto-reply</b>
            </div>
          </div>
        </div>
      </div>

      {/* Main Inbox Card */}
      <div className="sa-card sa-inbox" style={{ padding: 0 }}>
        {/* Left Navigation: Folders & Channels */}
        <div style={{ padding: 14, borderRight: "1px solid var(--sa-border)" }} className="sa-nav">
          <div className="sa-nav-sec" style={{ marginTop: 0 }}>INBOX FOLDERS</div>
          {FOLDERS.map(([k, ic, l]) => (
            <a
              key={k}
              href="#"
              className={cx(folder === k && "active")}
              onClick={(e) => {
                e.preventDefault();
                setFolder(k);
              }}
            >
              <Icon name={ic} size={18} />
              {l}
            </a>
          ))}

          <div className="sa-nav-sec">CHANNELS</div>
          <div className="row wrap" style={{ padding: "4px 8px", gap: 6 }}>
            {["instagram", "whatsapp", "facebook", "linkedin", "x", "tiktok", "youtube"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setChFilter(chFilter === p ? null : p)}
                style={{
                  opacity: chFilter && chFilter !== p ? 0.3 : 1,
                  transform: chFilter === p ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.15s ease",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                }}
                aria-label={`Filter ${p}`}
                title={`Filter by ${p}`}
              >
                <PlatformIcon platform={p} size={30} />
              </button>
            ))}
          </div>

          {/* Architecture Visual Callout */}
          <div
            style={{
              marginTop: 24,
              padding: 12,
              borderRadius: 10,
              background: "#f9f8ff",
              border: "1px solid #ebe6fb",
              fontSize: 11,
              lineHeight: 1.5,
              color: "#5b4cf6",
            }}
          >
            <b style={{ display: "block", marginBottom: 4 }}>⚡ Pipeline Active:</b>
            Webhook ➔ Filter ➔ BullMQ ➔ AI Agent ➔ Socket.IO ➔ Live UI
          </div>
        </div>

        {/* Center: Conversation List */}
        <div style={{ borderRight: "1px solid var(--sa-border)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: 14 }}>
            <div className="sa-search" style={{ flex: "none" }}>
              <Icon name="search" size={17} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search conversations..."
              />
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {loadingList && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--sa-muted)", fontSize: 13 }}>
                Loading conversations...
              </div>
            )}

            {!loadingList && conversations.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--sa-muted)", fontSize: 13 }}>
                <p>No conversations found in this view.</p>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSimModal(true)}
                  style={{ marginTop: 8 }}
                >
                  Simulate Incoming Webhook
                </Btn>
              </div>
            )}

            {!loadingList &&
              conversations.map((m) => {
                const isSelected = m._id === activeConv?._id;
                const tagColor = m.tag?.[0] || "blue";
                const tagLabel = m.tag?.[1] || "Question";

                return (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => setActiveId(m._id)}
                    className="row"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      alignItems: "flex-start",
                      padding: "16px 18px",
                      borderTop: "1px solid #f0f1f6",
                      background: isSelected ? "#f6f5ff" : undefined,
                      boxShadow: isSelected ? "inset 3px 0 0 var(--sa-primary)" : undefined,
                      cursor: "pointer",
                      border: "none",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <Avatar name={m.senderName} size={42} />
                      <span style={{ position: "absolute", right: -4, bottom: -4 }}>
                        <PlatformIcon platform={m.platform} size={18} />
                      </span>
                    </div>

                    <div className="grow" style={{ minWidth: 0, marginLeft: 12 }}>
                      <div className="row between" style={{ marginBottom: 3 }}>
                        <b className="strong ellipsis" style={{ fontSize: 14 }}>
                          {m.senderName}
                        </b>
                        <small className="muted" style={{ fontSize: 11 }}>
                          {formatTime(m.lastMessageAt)}
                        </small>
                      </div>
                      <div className="small muted ellipsis" style={{ fontSize: 13, color: isSelected ? "#374151" : undefined }}>
                        {m.lastMessageText || "No messages yet"}
                      </div>
                      <div className="row" style={{ marginTop: 6, gap: 6, alignItems: "center" }}>
                        <Pill tone={tagColor}>{tagLabel}</Pill>
                        {m.intent > 70 && (
                          <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>
                            {m.intent}% intent
                          </span>
                        )}
                        {m.autoReplied && (
                          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                            • Auto-replied
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Right Pane: Active Thread */}
        {activeConv ? (
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Header */}
            <div className="row" style={{ padding: "14px 20px", borderBottom: "1px solid var(--sa-border)", gap: 12 }}>
              <Avatar name={activeConv.senderName} size={44} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                  <b className="strong" style={{ fontSize: 16 }}>{activeConv.senderName}</b>
                  {activeConv.intent > 60 && (
                    <Pill tone="amber" icon="magnet">
                      Sales intent · {activeConv.intent}%
                    </Pill>
                  )}
                  {activeConv.status === "escalated" && (
                    <Pill tone="red">Escalated to Human</Pill>
                  )}
                </div>
                <small className="muted row" style={{ gap: 6, marginTop: 2 }}>
                  <PlatformIcon platform={activeConv.platform} size={15} />
                  {activeConv.senderRole} · {activeConv.platform.toUpperCase()}
                </small>
              </div>

              <IconBtn
                icon="userPlus"
                label="Assign"
                onClick={async () => {
                  await updateInboxConversation(activeConv._id, { assignedTo: "Mo Reyes" });
                  toast("Assigned to Mo Reyes", "success");
                }}
              />
              <IconBtn
                icon="archive"
                label="Archive"
                onClick={async () => {
                  await updateInboxConversation(activeConv._id, { status: "archived" });
                  toast("Conversation archived", "success");
                }}
              />
            </div>

            {/* Message History */}
            <div
              style={{
                flex: 1,
                background: "#fafafc",
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                overflowY: "auto",
              }}
            >
              <span className="sa-pill tone-outline" style={{ alignSelf: "center", fontSize: 11 }}>
                Today · Verified via Webhook
              </span>

              {loadingThread && (
                <div style={{ textAlign: "center", color: "var(--sa-muted)", padding: 20 }}>
                  Loading conversation history...
                </div>
              )}

              {!loadingThread &&
                messages.map((m) => {
                  const isMe = m.senderType === "brand" || m.senderType === "ai";
                  const isAi = m.senderType === "ai" || m.aiGenerated;

                  return (
                    <div
                      key={m._id}
                      className="row"
                      style={{
                        alignItems: "flex-end",
                        justifyContent: isMe ? "flex-end" : "flex-start",
                        gap: 8,
                      }}
                    >
                      {!isMe && <Avatar name={activeConv.senderName} size={30} />}
                      <div className={cx("sa-msg", isMe ? "me" : "them")}>
                        {m.text}
                        <small>
                          {formatTime(m.createdAt)}
                          {isAi && " · Auto-replied by AI"}
                        </small>
                      </div>
                    </div>
                  );
                })}

              {activeConv.status === "escalated" && (
                <div className="sa-banner tone-amber" style={{ padding: "12px 16px", marginTop: 8 }}>
                  <Icon name="flag" style={{ color: "#f59e0b" }} />
                  <span className="grow" style={{ fontSize: 13 }}>
                    <b className="strong">Escalated to human:</b> High-intent sales requests or complex inquiries are routed for personal handling.
                  </span>
                </div>
              )}
            </div>

            {/* AI Suggestion & Reply Input Box */}
            <div style={{ padding: 18, borderTop: "1px solid var(--sa-border)", background: "#fff" }}>
              {activeConv.aiSuggestedReply && (
                <div
                  style={{
                    background: "var(--sa-grad-soft)",
                    border: "1px solid #ebe6fb",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div className="row between small" style={{ color: "var(--sa-primary)", fontWeight: 600 }}>
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <Icon name="sparkles" size={15} />
                      AI suggested reply · {brandName} Brand Brain
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>
                      {activeConv.aiConfidence || 95}% confidence
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 0", lineHeight: 1.5, fontSize: 13, color: "#374151" }}>
                    {activeConv.aiSuggestedReply}
                  </p>
                </div>
              )}

              <div className="row" style={{ gap: 8 }}>
                <input
                  className="sa-input"
                  style={{ flex: 1 }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend(draft)}
                  placeholder={`Reply to ${activeConv.senderName} via Instagram API...`}
                  disabled={sending}
                />
                {activeConv.aiSuggestedReply && (
                  <Btn
                    variant="outline"
                    onClick={() => setDraft(activeConv.aiSuggestedReply)}
                    disabled={sending}
                  >
                    Use suggestion
                  </Btn>
                )}
                <Btn
                  variant="primary"
                  icon="send"
                  disabled={sending || (!draft.trim() && !activeConv.aiSuggestedReply)}
                  onClick={() => handleSend(draft || activeConv.aiSuggestedReply, !draft.trim())}
                >
                  {sending ? "Sending..." : draft ? "Send reply" : "Send suggestion"}
                </Btn>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--sa-muted)" }}>
            Select a conversation to view details
          </div>
        )}
      </div>

      {/* Webhook Simulator Modal */}
      {showSimModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowSimModal(false)}
        >
          <div
            className="sa-card"
            style={{
              width: "100%",
              maxWidth: 620,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 26,
              background: "#fff",
              borderRadius: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, margin: 0 }}>⚡ Test Webhook Pipeline</h2>
                <small className="muted">
                  Simulate incoming events to verify Backend Filtering, BullMQ, and Socket.IO real-time delivery.
                </small>
              </div>
              <IconBtn icon="x" label="Close" onClick={() => setShowSimModal(false)} />
            </div>

            {/* Quick Test Presets */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--sa-muted)", display: "block", marginBottom: 8 }}>
                CLICK A PRESET TEST SCENARIO:
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PRESET_SIMULATIONS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSimText(p.text);
                      setSimSender(p.senderName);
                      setSimPlatform(p.platform);
                      setSimEcho(Boolean(p.isEcho));
                    }}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      background: p.type === "filter" ? "#fff5f5" : "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    <div className="row between">
                      <b style={{ fontSize: 13, color: p.type === "filter" ? "#e11d48" : "#1e293b" }}>
                        {p.title}
                      </b>
                      <span
                        className="sa-pill"
                        style={{
                          fontSize: 10,
                          background: p.type === "filter" ? "#fee2e2" : "#dbeafe",
                          color: p.type === "filter" ? "#b91c1c" : "#1e40af",
                        }}
                      >
                        {p.type === "filter" ? "Filter Test" : "Queue + AI"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      &ldquo;{p.text}&rdquo;
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
              <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Sender Name:
                  </label>
                  <input
                    className="sa-input"
                    value={simSender}
                    onChange={(e) => setSimSender(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ width: 140 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Platform:
                  </label>
                  <select
                    className="sa-input"
                    value={simPlatform}
                    onChange={(e) => setSimPlatform(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Incoming Message Text:
                </label>
                <textarea
                  className="sa-input"
                  rows={3}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="Type any message to test..."
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="simEcho"
                  checked={simEcho}
                  onChange={(e) => setSimEcho(e.target.checked)}
                />
                <label htmlFor="simEcho" style={{ fontSize: 13, cursor: "pointer" }}>
                  Mark as Brand Echo message (simulates loop prevention filter)
                </label>
              </div>

              {simFeedback && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 16,
                    background: simFeedback.filtered ? "#fef2f2" : "#f0fdf4",
                    border: `1px solid ${simFeedback.filtered ? "#fecaca" : "#bbf7d0"}`,
                    fontSize: 13,
                    color: simFeedback.filtered ? "#991b1b" : "#166534",
                  }}
                >
                  <b style={{ display: "block", marginBottom: 2 }}>
                    {simFeedback.filtered ? "🛡️ Discarded by Backend Filter:" : "✅ Processed & Queued:"}
                  </b>
                  {simFeedback.message || simFeedback.reason}
                </div>
              )}

              <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                <Btn variant="outline" onClick={() => setShowSimModal(false)}>
                  Close
                </Btn>
                <Btn
                  variant="primary"
                  icon="sparkles"
                  disabled={simulating || !simText.trim()}
                  onClick={() => handleSimulate()}
                >
                  {simulating ? "Sending to Webhook..." : "Send Webhook Event"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
