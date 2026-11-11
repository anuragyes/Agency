// ─────────────────────────────────────────────────────────────
// WeeklyPlannerView.jsx — Modern 7-Day AI Content Sprint & Batch Planner
// Strategy Blueprint -> 7-Day Interactive Customization -> Parallel Generation ->
// Visual Review Gallery with Slide Flipper & Lightbox -> 1-Click Calendar Scheduling.
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Icon, { PlatformIcon } from "./Icon";
import { Btn, Card, Modal, Pill, Segmented, Spinner, cx, useToast } from "./kit";
import { useWorkspace } from "../store";
import {
  createWeeklyPlan,
  getLatestWeeklyPlan,
  addWeeklySlot,
  updateWeeklySlot,
  removeWeeklySlot,
  generateWeeklyAssets,
  regenerateWeeklySlot,
  toggleWeeklySlotApproval,
  approveAllWeeklySlots,
  scheduleAllWeeklySlots,
  deleteWeeklyPlan,
} from "../api";

const GOAL_OPTIONS = [
  { value: "Engagement & Community Growth", label: "🔥 Viral Engagement & Community" },
  { value: "Product Sales & Conversion", label: "🚀 Product Sales & Launch" },
  { value: "Brand Authority & Education", label: "🧠 Authority & Educational Value" },
  { value: "Brand Story & Behind-the-Scenes", label: "✨ Brand Storytelling & Culture" },
];

const FORMAT_OPTIONS = [
  { value: "image", label: "Single Image", icon: "image" },
  { value: "carousel", label: "Carousel (3-5 Slides)", icon: "carousel" },
  { value: "reel", label: "Reel / Video", icon: "video" },
];

// ── Reusable loading overlay for the whole view ──
function LoadingOverlay({ message = "Loading…" }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(246,246,250,0.82)",
        backdropFilter: "blur(4px)",
        gap: 16,
      }}
    >
      <Spinner size={40} />
      <span style={{ fontWeight: 700, fontSize: 15, color: "var(--sa-primary)" }}>{message}</span>
    </div>
  );
}

export default function WeeklyPlannerView() {
  const toast = useToast();
  const { current, refreshPosts } = useWorkspace();
  const productId = current?._id;

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [campaignGoal, setCampaignGoal] = useState("Engagement & Community Growth");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["instagram"]);
  const [activeSlideIdx, setActiveSlideIdx] = useState({});
  const [lightboxImg, setLightboxImg] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Start date options: "tomorrow" | "today" | "nextMonday" | "custom"
  const [startMode, setStartMode] = useState("tomorrow");
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const nextMon = useMemo(() => {
    const d = new Date();
    const daysUntilMon = ((1 + 7 - d.getDay()) % 7) || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const formatDateLabel = (d) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const computedStartDate = useMemo(() => {
    if (startMode === "today") return today;
    if (startMode === "tomorrow") return tomorrow;
    if (startMode === "nextMonday") return nextMon;
    if (startMode === "custom" && customDate) {
      const [y, m, day] = customDate.split("-").map(Number);
      if (y && m && day) return new Date(y, m - 1, day, 0, 0, 0);
    }
    return tomorrow;
  }, [startMode, customDate, today, tomorrow, nextMon]);

  const sprintDateRangePreview = useMemo(() => {
    const start = computedStartDate;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startStr: start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      endStr: end.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    };
  }, [computedStartDate]);

  // ── Load existing plan for active project ──
  const loadPlan = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await getLatestWeeklyPlan(productId);
      if (res?.data) {
        setActivePlan(res.data);
        if (res.data.campaignGoal) setCampaignGoal(res.data.campaignGoal);
        if (res.data.platforms) setSelectedPlatforms(res.data.platforms);
      } else {
        setActivePlan(null);
      }
    } catch (err) {
      console.warn("Could not load latest weekly plan:", err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // ── 1. Create new 7-Day Plan Blueprint ──
  const handleGenerateBlueprint = async () => {
    if (!productId) {
      toast("Please select an active project workspace first", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await createWeeklyPlan({
        productId,
        weekStartDate: computedStartDate,
        campaignGoal,
        platforms: selectedPlatforms,
      });
      if (res?.data) {
        setActivePlan(res.data);
        const startLabel = computedStartDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        toast(`7-Day sprint blueprint created starting ${startLabel}!`, "success");
      }
    } catch (err) {
      toast(`Failed to generate strategy: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── 2. Hard reset: delete existing plan and start fresh ──
  const handleResetSprint = async () => {
    if (!activePlan?._id) {
      setConfirmReset(false);
      setActivePlan(null);
      return;
    }
    setResetting(true);
    setConfirmReset(false);
    try {
      await deleteWeeklyPlan(activePlan._id);
      setActivePlan(null);
      toast("Sprint reset! Configure your new 7-day window and generate.", "info");
    } catch (err) {
      toast(`Reset failed: ${err.message}`, "error");
    } finally {
      setResetting(false);
    }
  };

  // ── 3. Start Parallel Generation ──
  const handleStartGeneration = async () => {
    if (!activePlan?._id) return;
    setGenerating(true);
    toast("Generating captions & images in parallel with controlled concurrency…", "info");
    try {
      const res = await generateWeeklyAssets(activePlan._id);
      if (res?.data) {
        setActivePlan(res.data);
        toast("All weekly posts generated! Review, edit captions, and approve below.", "success");
      }
    } catch (err) {
      toast(`Generation error: ${err.message}`, "error");
    } finally {
      setGenerating(false);
      loadPlan();
    }
  };

  // ── 4. Slot Actions ──
  const handleUpdateSlotField = async (slotId, updates) => {
    if (!activePlan?._id) return;
    try {
      const res = await updateWeeklySlot(activePlan._id, slotId, updates);
      if (res?.data) setActivePlan(res.data);
    } catch (err) {
      toast(`Update failed: ${err.message}`, "error");
    }
  };

  const handleRemoveSlot = async (slotId) => {
    if (!activePlan?._id) return;
    try {
      const res = await removeWeeklySlot(activePlan._id, slotId);
      if (res?.data) {
        setActivePlan(res.data);
        toast("Post removed from weekly sprint", "info");
      }
    } catch (err) {
      toast(`Remove failed: ${err.message}`, "error");
    }
  };

  const handleAddSlot = async (dayName, date) => {
    if (!activePlan?._id) return;
    try {
      const res = await addWeeklySlot(activePlan._id, {
        dayName,
        date,
        format: "image",
        topic: `Bonus ${dayName} Post`,
        hook: "Here is an extra insight for today.",
        time: "15:00",
      });
      if (res?.data) {
        setActivePlan(res.data);
        toast(`Added new post slot to ${dayName}`, "success");
      }
    } catch (err) {
      toast(`Add failed: ${err.message}`, "error");
    }
  };

  // ── 5. Single-Slot Regeneration ──
  const handleRegenerateSlot = async (slotId) => {
    if (!activePlan?._id) return;
    toast(`Regenerating post for ${slotId}…`, "info");
    try {
      const res = await regenerateWeeklySlot(activePlan._id, slotId);
      if (res?.data) {
        setActivePlan(res.data);
        toast(`Post ${slotId} refreshed with new assets!`, "success");
      }
    } catch (err) {
      toast(`Regeneration error: ${err.message}`, "error");
    }
  };

  // ── 6. Approvals ──
  const handleToggleApprove = async (slotId) => {
    if (!activePlan?._id) return;
    try {
      const res = await toggleWeeklySlotApproval(activePlan._id, slotId);
      if (res?.data) setActivePlan(res.data);
    } catch (err) {
      toast(`Approval failed: ${err.message}`, "error");
    }
  };

  const handleApproveAll = async () => {
    if (!activePlan?._id) return;
    try {
      const res = await approveAllWeeklySlots(activePlan._id);
      if (res?.data) {
        setActivePlan(res.data);
        toast("All ready posts marked as Approved! Ready to schedule.", "success");
      }
    } catch (err) {
      toast(`Approve all error: ${err.message}`, "error");
    }
  };

  // ── 7. Schedule All Approved Posts ──
  const handleScheduleAll = async () => {
    if (!activePlan?._id) return;
    setScheduling(true);
    try {
      const res = await scheduleAllWeeklySlots(activePlan._id);
      toast(res?.message || "Successfully scheduled posts into your live calendar!", "success");
      if (res?.data) setActivePlan(res.data);
      if (refreshPosts) refreshPosts();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setScheduling(false);
    }
  };

  const slots = activePlan?.slots || [];
  const readyCount = slots.filter((s) => s.status === "ready").length;
  const approvedCount = slots.filter((s) => s.isApproved && s.status === "ready").length;
  const isScheduled = activePlan?.overallStatus === "scheduled";

  // ── Shared select/button styles using app vars ──
  const selectStyle = {
    background: "var(--sa-bg)",
    border: "1px solid var(--sa-border)",
    color: "var(--sa-text)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  };

  const chipStyle = (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 12px",
    borderRadius: 20,
    border: active ? "1.5px solid var(--sa-primary)" : "1px solid var(--sa-border)",
    background: active ? "var(--sa-primary-50)" : "transparent",
    color: active ? "var(--sa-primary)" : "var(--sa-muted)",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s ease",
  });

  return (
    <div className="sa-weekly-planner" style={{ display: "grid", gap: 20 }}>
      {/* ── Full-screen loading overlay ── */}
      {(loading && !activePlan) && <LoadingOverlay message="Loading your sprint…" />}
      {generating && <LoadingOverlay message="AI is generating 7 posts in parallel… this takes ~30s" />}
      {scheduling && <LoadingOverlay message="Scheduling approved posts to your calendar…" />}
      {resetting && <LoadingOverlay message="Resetting sprint…" />}

      {/* ───── Hero Card (uses app card styles, NOT dark) ───── */}
      <div
        style={{
          background: "var(--sa-card, #fff)",
          borderRadius: 20,
          padding: "24px 28px",
          border: "1px solid var(--sa-border)",
          boxShadow: "var(--sa-shadow)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Soft purple gradient accent top-right */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(91,76,246,0.08) 0%, rgba(139,92,246,0.04) 60%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Top row: title + action buttons */}
        <div className="row between wrap" style={{ gap: 16, alignItems: "flex-start" }}>
          <div>
            <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span
                style={{
                  background: "var(--sa-grad)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                7-DAY BATCH SPRINT
              </span>
              <span style={{ color: "var(--sa-primary)", fontSize: 13, fontWeight: 600 }}>
                {current?.aiProfile?.name || "Active Workspace"}
              </span>
            </div>
            <h2 style={{ fontSize: 22, margin: "0 0 5px", fontWeight: 800, color: "var(--sa-ink)" }}>
              AI Weekly Content Sprint
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--sa-muted)", maxWidth: 580 }}>
              Plan, generate and schedule 7 days of varied content (Images, Carousels, Reels) in ~30 seconds with parallel AI workers.
            </p>
          </div>

          {/* Always-visible action buttons */}
          <div className="row wrap" style={{ gap: 8 }}>
            {activePlan && (
              <Btn
                variant="outline"
                icon="refresh"
                onClick={() => setConfirmReset(true)}
                loading={resetting}
                title="Start a brand-new 7-day sprint"
              >
                New Sprint
              </Btn>
            )}
            {!activePlan && (
              <Btn
                variant="primary"
                icon="sparkles"
                onClick={handleGenerateBlueprint}
                loading={loading}
                style={{ padding: "10px 22px", fontSize: 14, fontWeight: 700 }}
              >
                Generate 7-Day Strategy
              </Btn>
            )}
          </div>
        </div>

        {/* ───── Controls Bar (shown when no active plan OR plan exists for re-config) ───── */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 18,
            borderTop: "1px solid var(--sa-border)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Row 1: Campaign Goal + Target Channels */}
          <div className="row between wrap" style={{ gap: 16, alignItems: "center" }}>
            <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sa-text)" }}>Campaign Goal:</span>
              <select
                value={campaignGoal}
                onChange={(e) => setCampaignGoal(e.target.value)}
                style={selectStyle}
                disabled={!!activePlan}
              >
                {GOAL_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sa-text)" }}>Channels:</span>
              {["instagram", "facebook", "youtube"].map((p) => {
                const active = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!!activePlan}
                    onClick={() => {
                      setSelectedPlatforms((prev) =>
                        prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
                      );
                    }}
                    style={{ ...chipStyle(active), opacity: activePlan ? 0.65 : 1 }}
                  >
                    <PlatformIcon platform={p} size={15} />
                    <span>{p[0].toUpperCase() + p.slice(1)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Start Date Selection (only shown when no active plan) */}
          {!activePlan && (
            <div
              className="row between wrap"
              style={{
                paddingTop: 12,
                borderTop: "1px dashed var(--sa-border)",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sa-text)" }}>
                  🗓️ Start 7 Continuous Days From:
                </span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {[
                    { key: "tomorrow", label: `Tomorrow (${formatDateLabel(tomorrow)})` },
                    { key: "today", label: `Today (${formatDateLabel(today)})` },
                    { key: "nextMonday", label: `Next Monday (${formatDateLabel(nextMon)})` },
                    { key: "custom", label: "Custom Date…" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStartMode(opt.key)}
                      style={chipStyle(startMode === opt.key)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {startMode === "custom" && (
                  <input
                    type="date"
                    value={customDate}
                    min={today.toISOString().slice(0, 10)}
                    onChange={(e) => setCustomDate(e.target.value)}
                    style={{
                      ...selectStyle,
                      padding: "5px 10px",
                      border: "1.5px solid var(--sa-primary)",
                      color: "var(--sa-primary)",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  />
                )}
              </div>

              {/* Sprint window preview pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--sa-primary-50)",
                  border: "1px solid var(--sa-primary-100)",
                  borderRadius: 12,
                  padding: "5px 12px",
                  fontSize: 12,
                  color: "var(--sa-primary)",
                  fontWeight: 600,
                }}
              >
                ⚡ {sprintDateRangePreview.startStr} → {sprintDateRangePreview.endStr}
              </div>
            </div>
          )}

          {/* Active plan: show sprint window info */}
          {activePlan && (
            <div className="row wrap" style={{ gap: 10, alignItems: "center", paddingTop: 4 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--sa-primary-50)",
                  border: "1px solid var(--sa-primary-100)",
                  borderRadius: 10,
                  padding: "4px 12px",
                  fontSize: 12.5,
                  color: "var(--sa-primary)",
                  fontWeight: 600,
                }}
              >
                🗓️ {activePlan.weekStartDate
                  ? `${new Date(activePlan.weekStartDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} → ${new Date(activePlan.weekEndDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
                  : "7 Continuous Days"}
              </div>
              <span style={{ fontSize: 12.5, color: "var(--sa-muted)" }}>
                {readyCount} of {slots.length} posts ready · {approvedCount} approved
              </span>
              {loading && <Spinner size={14} />}
            </div>
          )}
        </div>
      </div>

      {/* ───── Loading State while fetching existing plan ───── */}
      {loading && activePlan && (
        <div className="row" style={{ justifyContent: "center", padding: 24, gap: 10, color: "var(--sa-muted)" }}>
          <Spinner size={18} />
          <span style={{ fontSize: 13.5 }}>Refreshing plan…</span>
        </div>
      )}

      {/* ───── Status & Action Bar (when plan exists) ───── */}
      {activePlan && (
        <div
          style={{
            background: "var(--sa-card, #fff)",
            border: "1px solid var(--sa-border)",
            borderRadius: 16,
            padding: "14px 20px",
            boxShadow: "var(--sa-shadow)",
          }}
        >
          <div className="row between wrap" style={{ gap: 12, alignItems: "center" }}>
            <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
              <Pill tone={isScheduled ? "green" : "violet"}>
                {isScheduled ? "✅ Scheduled" : activePlan.overallStatus.toUpperCase()}
              </Pill>
              {activePlan.overallStatus === "blueprint" && (
                <span className="small muted">Review the 7-day topics below, then generate all content in parallel.</span>
              )}
              {activePlan.overallStatus === "review" && (
                <span className="small muted">Review generated content, approve posts, then schedule.</span>
              )}
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              {/* Always show New Sprint in the action bar too */}
              <Btn
                variant="outline"
                size="sm"
                icon="refresh"
                onClick={() => setConfirmReset(true)}
                style={{ color: "var(--sa-muted)" }}
              >
                New Sprint
              </Btn>

              {activePlan.overallStatus === "blueprint" && (
                <Btn
                  variant="primary"
                  icon="sparkles"
                  onClick={handleStartGeneration}
                  loading={generating}
                  style={{ fontWeight: 700 }}
                >
                  Generate All in Parallel
                </Btn>
              )}

              {readyCount > 0 && !isScheduled && (
                <>
                  <Btn variant="outline" icon="check" onClick={handleApproveAll}>
                    Approve All ({readyCount})
                  </Btn>
                  <Btn
                    variant="primary"
                    icon="calendar"
                    onClick={handleScheduleAll}
                    loading={scheduling}
                    disabled={approvedCount === 0}
                    style={{ background: "var(--sa-green)", borderColor: "var(--sa-green)", fontWeight: 700 }}
                  >
                    Schedule {approvedCount > 0 ? `(${approvedCount})` : ""} to Calendar
                  </Btn>
                </>
              )}
            </div>
          </div>

          {/* ── Post-schedule success banner ── */}
          {isScheduled && (
            <div
              style={{
                marginTop: 14,
                padding: "16px 18px",
                background: "var(--sa-green-50)",
                borderRadius: 12,
                border: "1px solid #6ee7b7",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>🎉</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: "#065f46" }}>
                    Sprint Scheduled Successfully!
                  </div>
                  <div style={{ fontSize: 12.5, color: "#047857", marginTop: 2 }}>
                    Your approved posts are now live in the Calendar &amp; Pipeline. Check them under the Calendar tab.
                  </div>
                </div>
              </div>
              <Btn
                variant="primary"
                icon="sparkles"
                onClick={() => setConfirmReset(true)}
                style={{ background: "var(--sa-primary)", fontWeight: 700 }}
              >
                Start Next 7-Day Sprint
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* ───── Empty State (No Plan Yet) ───── */}
      {!activePlan && !loading && (
        <Card style={{ textAlign: "center", padding: "50px 20px" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "var(--sa-primary-50)",
              color: "var(--sa-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Icon name="calendar" size={32} />
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>No Active 7-Day Sprint</h3>
          <p className="muted" style={{ maxWidth: 440, margin: "0 auto 20px", fontSize: 14 }}>
            Generate your weekly content calendar using AI strategy and your active Brand Brain. Customize format types, review generated graphics, and schedule with one click.
          </p>
          <Btn variant="primary" icon="sparkles" onClick={handleGenerateBlueprint} loading={loading}>
            Create Your Sprint
          </Btn>
        </Card>
      )}

      {/* ───── 7-Day Visual Board Grid ───── */}
      {activePlan && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 16,
          }}
        >
          {slots.map((slot) => {
            const isReady = slot.status === "ready";
            const isGen = slot.status === "generating";
            const isCarousel = slot.format === "carousel";
            const mediaList = slot.mediaUrls || [];
            const currSlide = activeSlideIdx[slot.slotId] || 0;
            const currentImg = mediaList[currSlide] || mediaList[0];

            return (
              <div
                key={slot.slotId}
                className="sa-card"
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: slot.isApproved
                    ? "2px solid var(--sa-green)"
                    : isReady
                    ? "1.5px solid var(--sa-primary)"
                    : "1px solid var(--sa-border)",
                  background: "var(--sa-card-bg, #fff)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  transition: "all 0.2s ease",
                  boxShadow: slot.isApproved
                    ? "0 4px 16px rgba(16,185,129,0.1)"
                    : "var(--sa-shadow)",
                }}
              >
                {/* ── Slot Header: Day, Date, Time & Remove ── */}
                <div>
                  <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <b style={{ fontSize: 15, color: "var(--sa-ink)" }}>{slot.dayName}</b>
                      <span className="small muted">
                        {new Date(slot.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      {/* Editable Posting Time */}
                      <input
                        type="time"
                        value={slot.time || "10:00"}
                        onChange={(e) => handleUpdateSlotField(slot.slotId, { time: e.target.value })}
                        style={{
                          border: "1px solid var(--sa-border)",
                          borderRadius: 8,
                          padding: "3px 6px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--sa-primary)",
                          background: "var(--sa-bg)",
                          outline: "none",
                        }}
                        title="Click to edit posting time"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.slotId)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: "1px solid var(--sa-border)",
                          background: "var(--sa-bg)",
                          color: "var(--sa-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                        title="Remove this slot"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Platform + Format Tags */}
                  <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <select
                      value={slot.platform}
                      onChange={(e) => handleUpdateSlotField(slot.slotId, { platform: e.target.value })}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--sa-primary)",
                        border: "1px solid var(--sa-border)",
                        borderRadius: 8,
                        padding: "2px 6px",
                        background: "var(--sa-bg)",
                        outline: "none",
                      }}
                    >
                      {["instagram", "facebook", "youtube"].map((p) => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>

                    <select
                      value={slot.format}
                      onChange={(e) => handleUpdateSlotField(slot.slotId, { format: e.target.value })}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--sa-muted)",
                        border: "1px solid var(--sa-border)",
                        borderRadius: 8,
                        padding: "2px 6px",
                        background: "var(--sa-bg)",
                        outline: "none",
                      }}
                    >
                      {FORMAT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>

                    {/* Status Pill */}
                    {slot.isApproved ? (
                      <Pill tone="green" icon="check">Approved</Pill>
                    ) : isReady ? (
                      <Pill tone="violet">Ready</Pill>
                    ) : isGen ? (
                      <Pill tone="amber">Generating…</Pill>
                    ) : (
                      <Pill tone="gray">Blueprint</Pill>
                    )}
                  </div>

                  {/* ── Visual Media Container ── */}
                  <div
                    style={{
                      width: "100%",
                      height: 180,
                      borderRadius: 12,
                      overflow: "hidden",
                      position: "relative",
                      background: "var(--sa-gray-100)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    {isGen ? (
                      <div style={{ textAlign: "center", color: "var(--sa-muted)" }}>
                        <Spinner size={28} />
                        <div style={{ fontSize: 12, marginTop: 8 }}>Generating assets…</div>
                      </div>
                    ) : currentImg ? (
                      <>
                        <img
                          src={currentImg}
                          alt=""
                          onClick={() => setLightboxImg(currentImg)}
                          style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                          referrerPolicy="no-referrer"
                        />
                        <span
                          style={{
                            position: "absolute",
                            bottom: 6,
                            right: 6,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontSize: 10,
                            pointerEvents: "none",
                          }}
                        >
                          🔍 Zoom
                        </span>

                        {/* Carousel slide dots + arrows */}
                        {isCarousel && mediaList.length > 1 && (
                          <>
                            <div
                              style={{
                                position: "absolute",
                                bottom: 6,
                                left: "50%",
                                transform: "translateX(-50%)",
                                display: "flex",
                                gap: 4,
                              }}
                            >
                              {mediaList.map((_, i) => (
                                <span
                                  key={i}
                                  onClick={() => setActiveSlideIdx((prev) => ({ ...prev, [slot.slotId]: i }))}
                                  style={{
                                    width: i === currSlide ? 14 : 6,
                                    height: 6,
                                    borderRadius: 3,
                                    background: i === currSlide ? "var(--sa-primary)" : "rgba(255,255,255,0.6)",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                  }}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveSlideIdx((prev) => ({
                                  ...prev,
                                  [slot.slotId]: Math.max(0, (prev[slot.slotId] || 0) - 1),
                                }))
                              }
                              style={{
                                position: "absolute",
                                left: 6,
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "rgba(0,0,0,0.5)",
                                border: "none",
                                color: "#fff",
                                borderRadius: 6,
                                padding: "2px 7px",
                                fontSize: 14,
                                cursor: "pointer",
                              }}
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveSlideIdx((prev) => ({
                                  ...prev,
                                  [slot.slotId]: Math.min(mediaList.length - 1, (prev[slot.slotId] || 0) + 1),
                                }))
                              }
                              style={{
                                position: "absolute",
                                right: 6,
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "rgba(0,0,0,0.5)",
                                border: "none",
                                color: "#fff",
                                borderRadius: 6,
                                padding: "2px 7px",
                                fontSize: 14,
                                cursor: "pointer",
                              }}
                            >
                              ›
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: "center", color: "var(--sa-faint)" }}>
                        <Icon name="image" size={32} />
                        <div style={{ fontSize: 12, marginTop: 6 }}>
                          {slot.status === "failed" ? "⚠ Failed" : "Blueprint only"}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Topic & Hook */}
                  <div style={{ marginBottom: 8 }}>
                    <b style={{ fontSize: 13, display: "block", marginBottom: 3, color: "var(--sa-ink)" }}>
                      {slot.topic || "Topic TBD"}
                    </b>
                    <span className="small muted" style={{ display: "block", fontSize: 12, lineHeight: 1.35 }}>
                      "{slot.hook}"
                    </span>
                  </div>

                  {/* Caption Snippet / Edit Button */}
                  {slot.caption ? (
                    <div
                      style={{
                        padding: "8px 10px",
                        background: "var(--sa-bg)",
                        borderRadius: 10,
                        fontSize: 12,
                        marginBottom: 10,
                        maxHeight: 70,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "inherit",
                        lineHeight: 1.4,
                        position: "relative",
                      }}
                    >
                      {slot.caption}
                      <button
                        type="button"
                        onClick={() => setEditingSlot(slot)}
                        style={{
                          position: "absolute",
                          bottom: 4,
                          right: 6,
                          background: "var(--sa-card-bg, #fff)",
                          border: "1px solid var(--sa-border)",
                          borderRadius: 6,
                          fontSize: 10,
                          padding: "1px 6px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ✎ Edit
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* ── Slot Footer Actions ── */}
                <div style={{ borderTop: "1px solid var(--sa-border)", paddingTop: 12, marginTop: 6 }}>
                  {isReady ? (
                    <div className="row between" style={{ alignItems: "center" }}>
                      <Btn
                        size="sm"
                        variant="outline"
                        icon="refresh"
                        onClick={() => handleRegenerateSlot(slot.slotId)}
                        title="Re-roll only this post's image & copy"
                      >
                        Re-roll
                      </Btn>
                      <Btn
                        size="sm"
                        variant={slot.isApproved ? "primary" : "outline"}
                        icon="check"
                        onClick={() => handleToggleApprove(slot.slotId)}
                        style={
                          slot.isApproved
                            ? { background: "var(--sa-green)", borderColor: "var(--sa-green)" }
                            : { color: "var(--sa-green)", borderColor: "var(--sa-green)" }
                        }
                      >
                        {slot.isApproved ? "Approved ✓" : "Approve"}
                      </Btn>
                    </div>
                  ) : (
                    <div className="row between" style={{ alignItems: "center" }}>
                      <button
                        type="button"
                        className="sa-link small"
                        style={{ fontSize: 11.5, background: "none", border: "none", cursor: "pointer" }}
                        onClick={() => handleAddSlot(slot.dayName, slot.date)}
                      >
                        + Add 2nd Post
                      </button>
                      <Btn
                        size="sm"
                        variant="outline"
                        icon="sparkles"
                        onClick={() => handleRegenerateSlot(slot.slotId)}
                        loading={isGen}
                      >
                        Generate
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ───── Confirm Reset Modal ───── */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Start a New Sprint?"
      >
        <div style={{ display: "grid", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--sa-muted)", lineHeight: 1.5 }}>
            This will permanently delete your current sprint plan and all generated content.
            Any posts already scheduled to your calendar are <b>not</b> affected.
          </p>
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              icon="refresh"
              onClick={handleResetSprint}
              style={{ background: "var(--sa-primary)", fontWeight: 700 }}
            >
              Yes, Start New Sprint
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ───── Lightbox Modal ───── */}
      <Modal open={!!lightboxImg} onClose={() => setLightboxImg(null)} title="Full-Resolution Preview">
        {lightboxImg && (
          <div style={{ textAlign: "center" }}>
            <img
              src={lightboxImg}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 12, objectFit: "contain" }}
              referrerPolicy="no-referrer"
            />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Btn variant="outline" onClick={() => setLightboxImg(null)}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ───── Edit Caption Modal ───── */}
      <Modal open={!!editingSlot} onClose={() => setEditingSlot(null)} title={`Edit Caption — ${editingSlot?.dayName}`}>
        {editingSlot && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="strong" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
                Post Topic / Title
              </label>
              <input
                type="text"
                className="sa-input"
                value={editingSlot.topic || ""}
                onChange={(e) => setEditingSlot((prev) => ({ ...prev, topic: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 14 }}
              />
            </div>
            <div>
              <label className="strong" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
                Full Caption
              </label>
              <textarea
                className="sa-input"
                rows={7}
                value={editingSlot.caption || ""}
                onChange={(e) => setEditingSlot((prev) => ({ ...prev, caption: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 13.5, lineHeight: 1.4 }}
              />
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="outline" onClick={() => setEditingSlot(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                onClick={async () => {
                  await handleUpdateSlotField(editingSlot.slotId, {
                    topic: editingSlot.topic,
                    caption: editingSlot.caption,
                  });
                  setEditingSlot(null);
                  toast("Caption updated!", "success");
                }}
              >
                Save Caption
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
