// ─────────────────────────────────────────────────────────────
// ContentStudio.jsx — Streamlined AI Content Studio in 3 Visible Steps:
//   1. Prompt & Channels: user writes prompt, picks platform (mandatory), format & media mode
//   2. AI & Research: automated behind-the-scenes pipeline (Optimize -> JSON -> Platform Research -> Draft)
//   3. Review, Media & Publish: complete review interface (phone preview, caption editor, real hashtags,
//      add image from machine OR AI-generated image, approve, publish now or schedule for later)
//
// Plus "Make Your Project" RAG system:
//   User enters project name, description & optional website link.
//   The AI crawls the website, extracts catalog & tone, and builds a dedicated Markdown knowledge base.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Avatar, Btn, Card, Field, Modal, Pill, Segmented, Spinner, cx, gradientFor, useToast } from "../ui/kit";
import FlowSteps from "../ui/FlowSteps";
import PhonePreview from "../ui/PhonePreview";
import ImageGenerator from "../ui/ImageGenerator";
import ScheduleFields from "../ui/ScheduleFields";
import ProjectSelectorHub from "../ui/ProjectSelectorHub";
import CreateProjectModal from "../ui/CreateProjectModal";
import BrandKnowledgeModal from "../ui/BrandKnowledgeModal";
import { useWorkspace } from "../store";
import {
  STUDIO_PLATFORMS,
  createBrief,
  postApi,
  readStudioFlow,
  saveStudioFlow,
  searchHashtags,
} from "../api";
import {
  PLATFORM_META,
  STATUS_META,
  TYPE_META,
  coverText,
  defaultSchedule,
  editorPath,
  formatSchedule,
  fromScheduleInputs,
  hasUpcomingSchedule,
  postTitle,
  publishInfo,
  scheduleError,
  timeUntil,
  typeLabel,
} from "../postUtils";

const STEPS = [
  { label: "1 · Prompt & Channels", sub: "Prompt, channels & format" },
  { label: "2 · AI & Research", sub: "Automated behind the scenes" },
  { label: "3 · Review & Publish", sub: "Approve, media & publish" },
];

const FORMAT_OPTIONS = [
  { key: "image", label: "Single Image Post", icon: "image", desc: "High-impact feed photo" },
  { key: "carousel", label: "Carousel", icon: "carousel", desc: "Swipeable multi-slide guide" },
  { key: "reel", label: "Video / Reel", icon: "video", desc: "Engaging short-form video" },
  { key: "text", label: "Text Post", icon: "pen", desc: "Facebook conversation post", fbOnly: true },
];

const MEDIA_MODES = [
  { key: "ai", label: "AI Generated Image", icon: "sparkles", desc: "Auto-generate visual with AI" },
  { key: "machine", label: "Upload from Machine", icon: "upload", desc: "Upload image/video from your device" },
  { key: "review", label: "Custom / Review Later", icon: "pen", desc: "Decide in the review step" },
];

const QUICK_PROMPTS = [
  "Highlight our best-selling product and why customers love it",
  "Share a behind-the-scenes look at our quality and craftsmanship",
  "Announce a limited-time special offer with a strong call-to-action",
  "Address a common customer problem and how our product solves it",
];

const QUICK_REVISE = [
  { label: "Shorten", prompt: "Make the caption about 40% shorter. Keep the hook and CTA." },
  { label: "Catchy hook", prompt: "Rewrite the first line as a scroll-stopping hook that opens with a number or strong question." },
  { label: "Translate to Hinglish", prompt: "Translate the caption to Hinglish (Hindi written in Latin script), keep hashtags." },
  { label: "More emoji", prompt: "Add relevant emojis to the caption to make it more engaging without overdoing it." },
];

const EMPTY = {
  step: 0,
  prompt: "",
  platform: "instagram",
  format: "image",
  mediaMode: "ai",
  preparedMedia: [],
  useLiveHashtags: true,
  brief: null,
  usage: null,
  research: null,
  post: null,
  postUsage: null,
  error: "",
  researchJob: null,
  draft: null,
};

const POLL_MS = 1500;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
const platformOf = (key) => STUDIO_PLATFORMS.find((p) => p.key === key);

export default function ContentStudio() {
  const { current, products, productsLoading, online, upsertPost, addProduct, selectProduct, refreshProducts } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const pid = current?._id;

  const [flow, setFlowState] = useState(() => ({ ...EMPTY, ...(readStudioFlow(pid) || {}) }));
  const [busy, setBusy] = useState(""); // "pipeline" | "revise" | "approve" | "publish" | "schedule" | "upload"
  const [pipelineStage, setPipelineStage] = useState(0); // 1: optimize, 2: brief, 3: research, 4: post
  const [genOpen, setGenOpen] = useState(false);
  const [view, setView] = useState("feed");
  const [when, setWhen] = useState({ mode: "now", date: "", time: "" });
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const fileInputRef = useRef(null);
  const run = useRef(0);

  // Project & Knowledge Modals
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);

  // Prompt Required Popup Modal & Validation State
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptError, setPromptError] = useState(false);
  const [popupPrompt, setPopupPrompt] = useState("");
  const promptInputRef = useRef(null);

  const brandName = current?.aiProfile?.name || current?.name || current?.rawInput?.slice(0, 24) || "Your Project";



  const setFlow = (patch) => setFlowState((f) => ({ ...f, ...patch }));

  useEffect(() => () => { run.current++; }, []);
  useEffect(() => {
    run.current++;
    const saved = readStudioFlow(pid);
    if (saved) setFlowState({ ...EMPTY, ...saved });
    else setFlowState((f) => ({ ...EMPTY, platform: f.platform || "instagram" }));
  }, [pid]);
  useEffect(() => { saveStudioFlow(pid, flow); }, [pid, flow]);

  // Open "Make Your Project" modal automatically if no products exist
  useEffect(() => {
    if (!productsLoading && online && (!products || products.length === 0)) {
      setProjectModalOpen(true);
    }
  }, [productsLoading, products, online]);

  const { step, brief, research, post, platform: currentPlatformKey } = flow;
  const platform = platformOf(currentPlatformKey) || STUDIO_PLATFORMS[0];
  const offline = online === false;
  const activePost = post || null;
  const content = activePost?.content || {};
  const media = activePost?.media || [];
  const pm = PLATFORM_META[platform.key] || PLATFORM_META.instagram;
  const placement = view === "story" ? "story" : "feed";
  const whereLabel = placement === "story" ? "Story" : "Feed";

  /** Poll a research job until it finishes */
  const pollJob = async (api, jobId, myRun) => {
    const end = Date.now() + POLL_TIMEOUT_MS;
    let misses = 0;
    while (run.current === myRun) {
      try {
        const job = (await api.getResearchJob(jobId)).data;
        misses = 0;
        if (run.current !== myRun) return null;
        setFlow({ researchJob: job });
        if (job.state === "completed" || job.state === "failed") return job;
      } catch (e) {
        if (++misses >= 5) throw e;
      }
      if (Date.now() > end) throw new Error("Research is taking too long — try again.");
      await sleep(POLL_MS);
    }
    return null;
  };

  const handleGenerateClick = () => {
    const p = (flow.prompt || "").trim();
    if (p.length < 10) {
      setPromptError(true);
      setPopupPrompt(flow.prompt || "");
      setPromptModalOpen(true);
      toast("Prompt field is required to generate a post.", "error");
      promptInputRef.current?.focus();
      return;
    }
    if (!flow.platform) {
      toast("Please select a publishing channel (Instagram or Facebook).", "error");
      return;
    }
    if (!platform?.live) {
      toast(`${platform?.label || "Selected"} post generation is coming soon. Please select Instagram or Facebook.`, "error");
      return;
    }
    setPromptError(false);
    runAutomatedPipeline();
  };

  const handleModalSubmit = (e) => {
    e?.preventDefault();
    const finalPrompt = (popupPrompt || "").trim();
    if (finalPrompt.length < 10) {
      toast("Please write at least 10 characters in your prompt.", "error");
      return;
    }
    setFlow({ prompt: finalPrompt });
    setPromptError(false);
    setPromptModalOpen(false);
    runAutomatedPipeline(finalPrompt);
  };

  /* ─────────────────────────────────────────────────────────────
     AUTOMATED PIPELINE: Runs Step 2 behind the scenes without user stopping
     Optimizes -> Builds JSON brief -> Runs platform research -> Writes post
     ───────────────────────────────────────────────────────────── */
  const runAutomatedPipeline = async (overridePrompt) => {
    const activePrompt = (typeof overridePrompt === "string" ? overridePrompt : flow.prompt || "").trim();
    if (activePrompt.length < 10) {
      setPromptError(true);
      setPopupPrompt(flow.prompt || "");
      setPromptModalOpen(true);
      toast("Prompt field is required. Please write at least 10 characters.", "error");
      promptInputRef.current?.focus();
      return;
    }
    if (!flow.platform) {
      toast("Please select a platform.", "error");
      return;
    }
    if (!platform?.live) {
      toast(`${platform.label} post generation is coming soon. Please select Instagram or Facebook.`, "error");
      return;
    }

    const myRun = ++run.current;
    setBusy("pipeline");
    setFlow({ step: 1, error: "", researchJob: null, draft: null, prompt: activePrompt });

    try {
      // Stage 1 & 2: Prompt optimization + JSON brief
      setPipelineStage(1);
      const briefRes = await createBrief({ productId: pid, userPrompt: activePrompt });
      if (run.current !== myRun) return;
      const optimizedBrief = briefRes.data;
      setFlow({ brief: optimizedBrief, usage: briefRes.usage, rag: briefRes.rag });

      setPipelineStage(2);
      await sleep(300);

      // Stage 3 & 4: Platform Research + Post Generation
      setPipelineStage(3);
      const api = postApi(platform.key);

      let generatedPostDoc = null;
      let finalResearch = null;

      if (platform.key === "instagram") {
        // Fast path: start research job and concurrently generate draft
        const started = (await api.startResearchJob({ productId: pid, brief: optimizedBrief })).data;
        setFlow({ researchJob: { jobId: started.jobId, mode: started.mode, state: "waiting" } });

        setPipelineStage(4);
        const draftPromise = api.generatePost({
          productId: pid,
          brief: optimizedBrief,
          contentType: flow.format,
          deferResearch: true,
        }).then((g) => {
          if (run.current === myRun) setFlow({ draft: g.data, postUsage: g.usage });
          return g;
        });

        const jobPromise = pollJob(api, started.jobId, myRun);
        const [g, job] = await Promise.all([draftPromise, jobPromise]);
        if (!job || run.current !== myRun) return;

        generatedPostDoc = g.data;
        finalResearch = job.state === "completed" ? job.result : { hashtags: [], mediaAnalyzed: 0, error: job.failedReason };
        setFlow({ research: finalResearch });

        if (job.state === "completed") {
          const r = await api.applyLiveHashtags(generatedPostDoc._id, { jobId: started.jobId });
          generatedPostDoc = r.data;
        }
      } else {
        // Facebook path
        const res = (await api.researchBrief({ productId: pid, brief: optimizedBrief })).data;
        finalResearch = res;
        setFlow({ research: res });

        setPipelineStage(4);
        const g = await api.generatePost({
          productId: pid,
          brief: optimizedBrief,
          research: res,
          contentType: flow.format,
        });
        generatedPostDoc = g.data;
      }

      if (run.current !== myRun) return;

      // Auto-pair prepared media if user created/selected it in Step 1
      if (flow.preparedMedia && flow.preparedMedia.length > 0) {
        try {
          const updateRes = await api.updatePost(generatedPostDoc._id, {
            content: generatedPostDoc.content,
            media: flow.preparedMedia,
          });
          if (updateRes?.data) generatedPostDoc = updateRes.data;
        } catch (e) {
          console.warn("Failed to attach prepared media:", e.message);
        }
      }

      upsertPost(generatedPostDoc);
      setFlow({
        research: finalResearch,
        post: generatedPostDoc,
        step: 2, // Auto transition to Review & Publish!
      });
      toast(`Your ${platform.label} post is ready with visual & copy!`, "success");
    } catch (e) {
      setFlow({ error: e.message || "Failed to generate post. Please try again." });
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  /* ─────────────────────────────────────────────────────────────
     Review Step Functions: Edit, Revise, Upload, Media, Approve, Publish
     ───────────────────────────────────────────────────────────── */
  const updateContent = (patch) => {
    if (!activePost) return;
    const nextContent = { ...content, ...patch };
    const updatedPost = { ...activePost, content: nextContent };
    setFlow({ post: updatedPost });
  };

  const savePostChanges = async (notify = true) => {
    if (!activePost) return;
    setBusy("save");
    try {
      const api = postApi(platform.key);
      const r = await api.updatePost(activePost._id, { content, media });
      setFlow({ post: r.data });
      upsertPost(r.data);
      if (notify) toast("Post saved successfully", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleRevise = async (revisePrompt) => {
    if (!activePost) return;
    setBusy("revise");
    try {
      const api = postApi(platform.key);
      const r = await api.revisePost(activePost._id, revisePrompt, activePost.contentType);
      setFlow({ post: r.data });
      upsertPost(r.data);
      toast("AI revised your post!", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const toggleHashtag = (tag) => {
    const list = content.hashtags || [];
    const cleanTag = tag.startsWith("#") ? tag : `#${tag}`;
    const next = list.includes(cleanTag)
      ? list.filter((t) => t !== cleanTag)
      : [...list, cleanTag].slice(0, pm.maxTags || 6);
    updateContent({ hashtags: next });
  };

  const addCustomHashtag = (e) => {
    e.preventDefault();
    const tag = customTagInput.trim().replace(/^#+/, "");
    if (!tag) return;
    const formatted = `#${tag}`;
    const list = content.hashtags || [];
    if (!list.includes(formatted)) {
      if (list.length >= (pm.maxTags || 6)) {
        toast(`Max ${pm.maxTags || 6} hashtags allowed`, "error");
        return;
      }
      updateContent({ hashtags: [...list, formatted] });
      setCustomTagInput("");
    }
  };

  const handleFileUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("upload");
    try {
      const api = postApi(platform.key);
      const r = await api.uploadMedia(f);
      if (activePost) {
        const nextMedia = activePost.contentType === "carousel"
          ? [...media, r.data].slice(0, 10)
          : [r.data];
        const saveRes = await api.updatePost(activePost._id, { content, media: nextMedia });
        const updatedPost = saveRes.data || { ...activePost, media: nextMedia };
        setFlow({ post: updatedPost, preparedMedia: nextMedia });
        upsertPost(updatedPost);
        toast("Media uploaded from machine & saved!", "success");
      } else {
        setFlow({ preparedMedia: [r.data] });
        toast("Image uploaded & ready for your post!", "success");
      }
    } catch (er) {
      toast(er.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleAiImagesPicked = async (picked) => {
    const list = (Array.isArray(picked) ? picked : [picked]).filter((m) => m?.url);
    if (!list.length) return;
    const items = list.map((m) => ({
      type: "image",
      url: m.url,
      mimeType: m.mimeType || "image/jpeg",
      source: m.source || "upload",
    }));

    if (activePost) {
      const nextMedia = activePost.contentType === "carousel"
        ? [...media, ...items].slice(0, 10)
        : items.slice(0, 1);
      try {
        const api = postApi(platform.key);
        const saveRes = await api.updatePost(activePost._id, { content, media: nextMedia });
        const updatedPost = saveRes.data || { ...activePost, media: nextMedia };
        setFlow({ post: updatedPost, preparedMedia: nextMedia });
        upsertPost(updatedPost);
        toast(`${items.length} AI image${items.length > 1 ? "s" : ""} added & saved!`, "success");
      } catch (er) {
        toast(er.message, "error");
      }
    } else {
      setFlow({ preparedMedia: items });
      toast(`${items.length} AI generated visual${items.length > 1 ? "s" : ""} attached & ready for post!`, "success");
    }
  };

  const handleRemoveMedia = async (idx) => {
    if (!activePost) return;
    const nextMedia = media.filter((_, i) => i !== idx);
    try {
      const api = postApi(platform.key);
      const saveRes = await api.updatePost(activePost._id, { content, media: nextMedia });
      const updatedPost = saveRes.data || { ...activePost, media: nextMedia };
      setFlow({ post: updatedPost });
      upsertPost(updatedPost);
    } catch (er) {
      toast(er.message, "error");
    }
  };

  const handleApprove = async () => {
    if (!activePost) return;
    setBusy("approve");
    try {
      const api = postApi(platform.key);
      // Ensure media and content are saved to MongoDB first
      await api.updatePost(activePost._id, { content, media });
      const r = await api.approvePost(activePost._id, placement);
      setFlow({ post: r.data });
      upsertPost(r.data);
      toast("Post approved! You can now publish or schedule it.", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handlePublishNow = async () => {
    if (!activePost) return;
    setBusy("publish");
    try {
      const api = postApi(platform.key);
      // Ensure media and content are saved first, then approved
      await api.updatePost(activePost._id, { content, media });
      await api.approvePost(activePost._id, placement);
      const r = await api.publishPost(activePost._id, placement);
      setFlow({ post: r.data });
      upsertPost(r.data);
      toast(`Post successfully published to your ${pm.where[placement]}!`, "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const handleScheduleSubmit = async () => {
    const bad = scheduleError(when);
    if (bad) { toast(bad, "error"); return; }
    const at = fromScheduleInputs(when);
    if (!activePost) return;

    setBusy("schedule");
    try {
      const api = postApi(platform.key);
      // Ensure media and content are saved to MongoDB first, then approved
      await api.updatePost(activePost._id, { content, media });
      await api.approvePost(activePost._id, placement);
      const r = await api.schedulePost(activePost._id, at.toISOString(), placement);
      setFlow({ post: r.data });
      upsertPost(r.data);
      setScheduleModalOpen(false);
      toast(`Post scheduled for ${formatSchedule(r.data.scheduledAt)}!`, "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const restart = () => {
    run.current++;
    setPromptError(false);
    setPromptModalOpen(false);
    setFlowState({ ...EMPTY, platform: flow.platform || "instagram" });
  };


  const totalTokens =
    (flow.usage?.promptTokens || 0) +
    (flow.usage?.completionTokens || 0) +
    (flow.postUsage?.promptTokens || 0) +
    (flow.postUsage?.completionTokens || 0);

  const realHashtagPool = useMemo(() => {
    const list = research?.hashtags || [];
    return list.map((h) => (typeof h === "string" ? h : h.hashtag || "")).filter(Boolean);
  }, [research]);

  return (
    <div className="sa-studio" style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* ───── Project Selector Hub ───── */}
      <ProjectSelectorHub
        current={current}
        products={products}
        onSelect={(id) => selectProduct(id)}
        onNewProject={() => setProjectModalOpen(true)}
        title="AI Content Studio · Choose Project"
        subtitle="Select a project below to write high-converting posts. Prompts, voice, and RAG knowledge automatically sync to the chosen project."
        actionText="+ New Project"
      />

      {/* ───── Selected Project Details Card ───── */}
      {current && (
        <Card style={{ marginBottom: 24, padding: "20px 24px", border: "1px solid var(--sa-border)", background: "var(--sa-card-bg)" }}>
          <div className="row between wrap" style={{ gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
            <div className="row" style={{ gap: 14, alignItems: "center" }}>
              <Avatar name={brandName} size={48} />
              <div>
                <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{brandName}</h3>
                  {current.aiProfile?.category && (
                    <Pill tone="blue">{current.aiProfile.category}</Pill>
                  )}
                  {current.websiteUrl && (
                    <a
                      href={current.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      <Pill tone="green" icon="globe">
                        {current.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                      </Pill>
                    </a>
                  )}
                </div>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  Active project context for AI drafting, platform research, and RAG retrieval
                </p>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              <Btn
                icon="book"
                variant="ghost"
                size="sm"
                onClick={() => setKnowledgeModalOpen(true)}
              >
                Manage Brain ({current.chunkCount || current.knowledgeChunks?.length || (current.knowledgeMd ? 1 : 0)} Chunks)
              </Btn>
              <Btn
                icon="plus"
                variant="outline"
                size="sm"
                onClick={() => setKnowledgeModalOpen(true)}
              >
                + Add Context
              </Btn>
              {step > 0 && (
                <Btn icon="refresh" size="sm" onClick={restart} disabled={!!busy}>
                  Start over
                </Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ───── 3-Step Navigation Bar ───── */}
      <FlowSteps
        steps={STEPS}
        current={step}
        reached={step}
        onStep={busy ? undefined : (i) => setFlow({ step: i })}
      />

      {/* ═════════════════════════════════════════════════════════════
          STEP 1: PROMPT & CHANNELS (Configure prompt, platform, format, media)
          ═════════════════════════════════════════════════════════════ */}
      {step === 0 && (
        <section className="sa-step-card" style={{ display: "grid", gap: 24 }}>
          <div>
            <h2>1 · Describe your post & configure channels</h2>
            <p className="lead">
              Enter your prompt, choose your mandatory publishing channel, pick format and media preference.
              Optimization, platform research, and draft generation run automatically behind the scenes.
            </p>
          </div>



          {/* Prompt Textarea */}
          <div style={{ display: "grid", gap: 8 }}>
            <div className="row between">
              <label className="strong" style={{ fontSize: 14 }}>
                Post Prompt & Concept <span className="red">*</span>
                {promptError && flow.prompt.trim().length < 10 && (
                  <span style={{ color: "#ef4444", fontSize: 12, marginLeft: 8, fontWeight: 500 }}>
                    (Field Required)
                  </span>
                )}
              </label>
              <span className={cx("small", promptError && flow.prompt.trim().length < 10 ? "red" : "muted")}>
                {flow.prompt.trim().length}/10 min characters
              </span>
            </div>
            <textarea
              ref={promptInputRef}
              className="big"
              value={flow.prompt}
              onChange={(e) => {
                setFlow({ prompt: e.target.value });
                if (promptError && e.target.value.trim().length >= 10) setPromptError(false);
              }}
              aria-label="Product prompt"
              placeholder="e.g. We sell pure A2 desi cow ghee made with traditional bilona method, ₹899 for 500ml. Highlight the health benefits for families and home cooks, and get more orders."
              style={promptError && flow.prompt.trim().length < 10 ? {
                borderColor: "#ef4444",
                boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.15)",
              } : undefined}
            />
            {promptError && flow.prompt.trim().length < 10 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", fontSize: 12.5, fontWeight: 500 }}>
                <Icon name="alert" size={14} />
                <span>Prompt field is required. Please write at least 10 characters to generate post with AI.</span>
              </div>
            )}
          </div>

          {/* Mandatory Platform Selection */}
          <div style={{ display: "grid", gap: 10 }}>
            <label className="strong" style={{ fontSize: 14 }}>
              Publishing Channel <span className="red">*</span> (Mandatory)
            </label>
            <div className="sa-pcards" role="radiogroup" aria-label="Platform">
              {STUDIO_PLATFORMS.map((p) => {
                const isSelected = flow.platform === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!p.live}
                    className={cx("sa-pcard", isSelected && "on")}
                    onClick={() => setFlow({ platform: p.key })}
                  >
                    <PlatformIcon platform={p.key} size={42} radius={12} />
                    <span>{p.label}</span>
                    <small>{p.live ? "Ready" : "Coming soon"}</small>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Post Format Selection */}
          <div style={{ display: "grid", gap: 10 }}>
            <label className="strong" style={{ fontSize: 14 }}>Post Format</label>
            <div className="row wrap" style={{ gap: 10 }}>
              {FORMAT_OPTIONS.filter((f) => !f.fbOnly || flow.platform === "facebook").map((fmt) => {
                const isSelected = flow.format === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    type="button"
                    className={cx("sa-chip", isSelected && "on")}
                    style={{
                      height: 48,
                      padding: "0 18px",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      border: isSelected ? "1.5px solid var(--sa-primary)" : "1px solid var(--sa-border)",
                      background: isSelected ? "var(--sa-primary-50)" : "#fff",
                    }}
                    onClick={() => setFlow({ format: fmt.key })}
                  >
                    <Icon name={fmt.icon} size={18} />
                    <div style={{ textAlign: "left", lineHeight: 1.2 }}>
                      <b style={{ display: "block", fontSize: 13.5 }}>{fmt.label}</b>
                      <small className="muted" style={{ fontSize: 11 }}>{fmt.desc}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media & Image Configuration */}
          <div style={{ display: "grid", gap: 12 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <label className="strong" style={{ fontSize: 14 }}>Media / Image Preference</label>
              {flow.preparedMedia?.length > 0 && (
                <span className="small" style={{ color: "#10b981", fontWeight: 600 }}>
                  ✓ {flow.preparedMedia.length} visual asset ready
                </span>
              )}
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              {MEDIA_MODES.map((mm) => {
                const isSelected = flow.mediaMode === mm.key;
                return (
                  <button
                    key={mm.key}
                    type="button"
                    className={cx("sa-chip", isSelected && "on")}
                    style={{
                      height: 46,
                      padding: "0 16px",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      cursor: "pointer",
                      border: isSelected ? "1.5px solid var(--sa-primary)" : "1px solid var(--sa-border)",
                      background: isSelected ? "var(--sa-primary-50)" : "#fff",
                    }}
                    onClick={() => setFlow({ mediaMode: mm.key })}
                  >
                    <Icon name={mm.icon} size={16} />
                    <span style={{ fontSize: 13.5, fontWeight: isSelected ? 600 : 500 }}>{mm.label}</span>
                  </button>
                );
              })}
            </div>

            {/* AI Image Generation Panel (Step 1 Pre-generation) */}
            {flow.mediaMode === "ai" && (
              <div style={{ background: "var(--sa-primary-50)", border: "1.5px dashed #c7bbf9", borderRadius: 16, padding: "16px 20px" }}>
                {flow.preparedMedia?.length > 0 ? (
                  <div className="row wrap between" style={{ gap: 14, alignItems: "center" }}>
                    <div className="row" style={{ gap: 14, alignItems: "center" }}>
                      <img
                        src={flow.preparedMedia[0].url}
                        alt="AI Preview"
                        style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                      />
                      <div>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span className="strong" style={{ fontSize: 14, color: "var(--sa-ink)" }}>
                            AI Generated Visual Attached
                          </span>
                          <Pill tone="green">Ready</Pill>
                        </div>
                        <p className="small muted" style={{ margin: "4px 0 0" }}>
                          This image will automatically pair with your post copy during Step 2.
                        </p>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <Btn
                        size="sm"
                        variant="primary"
                        icon="sparkles"
                        onClick={() => setGenOpen(true)}
                      >
                        Re-generate / Change
                      </Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => setFlow({ preparedMedia: [] })}
                      >
                        Remove
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div className="row wrap between" style={{ gap: 14, alignItems: "center" }}>
                    <div>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <Icon name="sparkles" size={18} style={{ color: "var(--sa-primary)" }} />
                        <span className="strong" style={{ fontSize: 14.5 }}>
                          Generate Image with AI (Pre-generate now)
                        </span>
                      </div>
                      <p className="small muted" style={{ margin: "4px 0 0", maxWidth: 520, lineHeight: 1.5 }}>
                        Click below to open the AI Image Studio. Customize scene from prompt or place your real product packshot into an AI scene, choose aspect ratio, logo corner, and generate.
                      </p>
                    </div>
                    <Btn
                      variant="grad"
                      icon="sparkles"
                      onClick={() => setGenOpen(true)}
                    >
                      Generate Images with AI
                    </Btn>
                  </div>
                )}
              </div>
            )}

            {/* Machine Upload Panel (Step 1 Device Upload) */}
            {flow.mediaMode === "machine" && (
              <div style={{ background: "var(--sa-bg)", border: "1.5px dashed var(--sa-border)", borderRadius: 16, padding: "16px 20px" }}>
                {flow.preparedMedia?.length > 0 ? (
                  <div className="row wrap between" style={{ gap: 14, alignItems: "center" }}>
                    <div className="row" style={{ gap: 14, alignItems: "center" }}>
                      <img
                        src={flow.preparedMedia[0].url}
                        alt="Uploaded Preview"
                        style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                      />
                      <div>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span className="strong" style={{ fontSize: 14 }}>Local Device File Ready</span>
                          <Pill tone="blue">Selected</Pill>
                        </div>
                        <p className="small muted" style={{ margin: "4px 0 0" }}>
                          Will be attached to the post automatically when generated.
                        </p>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <Btn
                        size="sm"
                        variant="outline"
                        icon="upload"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change File
                      </Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => setFlow({ preparedMedia: [] })}
                      >
                        Remove
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div className="row wrap between" style={{ gap: 14, alignItems: "center" }}>
                    <div>
                      <span className="strong" style={{ fontSize: 14.5 }}>Upload from your device</span>
                      <p className="small muted" style={{ margin: "4px 0 0" }}>
                        Select a JPEG, PNG photo, or MP4 video from your computer to attach to this post.
                      </p>
                    </div>
                    <Btn
                      variant="outline"
                      icon="upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Select File from Device
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real Hashtags Toggle */}
          <label className="row" style={{ gap: 10, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={flow.useLiveHashtags}
              onChange={(e) => setFlow({ useLiveHashtags: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: "var(--sa-primary)" }}
            />
            <span style={{ fontSize: 14 }}>
              <b>Run Live Platform Hashtag Research</b>
              <small className="muted" style={{ display: "block" }}>
                Finds high-performing live hashtags and audience keywords across {platform.label}.
              </small>
            </span>
          </label>

          {/* Step 1 Footer Action */}
          <div className="sa-step-foot">
            <span className="small muted">
              {offline
                ? "The backend is offline — please ensure server is running."
                : flow.prompt.trim().length === 0
                  ? "Prompt is required — click Generate or enter your concept above."
                  : flow.prompt.trim().length < 10
                    ? `Write at least 10 characters to generate post (${flow.prompt.trim().length}/10).`
                    : "Next: AI optimizes prompt, runs platform research, and drafts the post automatically."}
            </span>

            <Btn
              variant="grad"
              icon="sparkles"
              iconRight="arrowRight"
              size="lg"
              onClick={handleGenerateClick}
              loading={busy === "pipeline"}
              disabled={offline}
            >
              Generate Post with AI
            </Btn>
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════
          STEP 2: AI & RESEARCH (Automated Behind-The-Scenes Pipeline)
          ═════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <section className="sa-step-card" style={{ padding: 36, textAlign: "center" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 24 }}>
            <div>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--sa-primary-50)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
                <Spinner size={32} />
              </div>
              <h2>2 · AI Research & Generation in Progress</h2>
              <p className="lead" style={{ margin: "4px 0 0" }}>
                Running background steps seamlessly. No manual intervention needed — your post will open automatically once ready.
              </p>
            </div>

            {/* Behind the scenes progress checklist */}
            <div style={{ background: "var(--sa-bg)", borderRadius: 18, padding: 20, textAlign: "left" }}>
              <ul className="sa-progress" style={{ gap: 12 }}>
                <li className={cx(pipelineStage >= 1 && "done")}>
                  <span className="dot">
                    {pipelineStage > 1 ? <Icon name="check" size={16} stroke={3} /> : <Spinner size={16} />}
                  </span>
                  <span>
                    <b>Prompt Optimization & Key Concepts</b>
                    <small>Cleaning up prompt and extracting high-converting product keywords</small>
                  </span>
                </li>

                <li className={cx(pipelineStage >= 2 && "done")}>
                  <span className="dot">
                    {pipelineStage > 2 ? <Icon name="check" size={16} stroke={3} /> : pipelineStage === 2 ? <Spinner size={16} /> : 2}
                  </span>
                  <span>
                    <b>Compiling JSON Brief</b>
                    <small>Structuring audience, angle, value propositions & call-to-action</small>
                  </span>
                </li>

                <li className={cx(pipelineStage >= 3 && "done")}>
                  <span className="dot">
                    {pipelineStage > 3 ? <Icon name="check" size={16} stroke={3} /> : pipelineStage === 3 ? <Spinner size={16} /> : 3}
                  </span>
                  <span>
                    <b>Platform Research ({platform.label})</b>
                    <small>Reading live platform hashtags and analyzing top viral content formats</small>
                  </span>
                </li>

                <li className={cx(pipelineStage >= 4 && "done")}>
                  <span className="dot">
                    {activePost ? <Icon name="check" size={16} stroke={3} /> : pipelineStage === 4 ? <Spinner size={16} /> : 4}
                  </span>
                  <span>
                    <b>Drafting Creative Copy & Assembling Visuals</b>
                    <small>
                      {flow.preparedMedia?.length
                        ? "Post copy generated and visual asset automatically paired"
                        : "Composing attention-grabbing hook, caption, hashtags and image concept"}
                    </small>
                  </span>
                </li>
              </ul>
            </div>

            {flow.rag && (
              <div style={{ background: "var(--sa-primary-50)", border: "1px solid #e0d8fe", borderRadius: 14, padding: "12px 16px", textAlign: "left" }}>
                <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <Icon name="sparkles" size={16} style={{ color: "var(--sa-primary)" }} />
                  <span className="small strong" style={{ color: "var(--sa-primary-dark, #4338ca)" }}>
                    Semantic RAG Context Injected
                  </span>
                </div>
                <div className="small muted" style={{ lineHeight: 1.5 }}>
                  Retrieved {flow.rag.retrievedChunks?.length || 0} discrete knowledge chunks
                  {flow.rag.tokensSaved > 0 && ` · Saved approx ~${flow.rag.tokensSaved} prompt tokens`}
                </div>
              </div>
            )}

            {flow.error && (
              <div className="sa-banner tone-red" style={{ padding: 14 }}>
                <Icon name="alert" />
                <span className="grow small" style={{ textAlign: "left" }}>{flow.error}</span>
                <Btn size="sm" variant="primary" icon="refresh" onClick={runAutomatedPipeline}>Try Again</Btn>
              </div>
            )}

            <div className="row center" style={{ gap: 12 }}>
              <Btn icon="arrowLeft" onClick={() => setFlow({ step: 0 })}>Back to Prompt</Btn>
              {activePost && (
                <Btn variant="primary" iconRight="arrowRight" onClick={() => setFlow({ step: 2 })}>
                  View Post Review
                </Btn>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════
          STEP 3: REVIEW, MEDIA & PUBLISH (Interactive Review & Actions)
          ═════════════════════════════════════════════════════════════ */}
      {step === 2 && activePost && (
        <section className="sa-step-card" style={{ padding: 24 }}>
          {/* Top Review Bar */}
          <div className="row between wrap" style={{ gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--sa-border)" }}>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <h2>3 · Review & Publish</h2>
                <Pill tone={STATUS_META[activePost.status]?.tone || "amber"} icon={STATUS_META[activePost.status]?.icon}>
                  {STATUS_META[activePost.status]?.label || "Ready to Review"}
                </Pill>
              </div>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                {typeLabel(activePost)} for {platform.label} · ≈{fmtTokens(totalTokens)} tokens utilized
              </p>
              {activePost.performanceLearnings?.summary && (
                <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 6, fontSize: 13, color: "var(--sa-emerald, #059669)", fontWeight: 500 }}>
                  <Icon name="check" size={14} />
                  <span>{activePost.performanceLearnings.summary}</span>
                </div>
              )}
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              {platform.key === "instagram" && (
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "feed", label: "Feed Preview" },
                    { value: "story", label: "Story Preview" },
                  ]}
                />
              )}
              <Btn
                icon="calendar"
                size="sm"
                variant="outline"
                onClick={() => {
                  setWhen({ mode: "later", ...defaultSchedule(activePost.scheduledAt) });
                  setScheduleModalOpen(true);
                }}
                disabled={activePost.status === "published"}
              >
                Schedule
              </Btn>
              <Btn
                variant="grad"
                icon="upload"
                size="sm"
                loading={busy === "publish"}
                onClick={handlePublishNow}
                disabled={activePost.status === "published"}
              >
                {activePost.status === "published" ? "Published" : `Publish to ${whereLabel}`}
              </Btn>
              <Btn icon="copy" variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText([content.caption, (content.hashtags || []).join(" ")].filter(Boolean).join("\n\n")); toast("Caption copied to clipboard!", "success"); }}>
                Copy
              </Btn>
              <Btn icon="refresh" variant="ghost" size="sm" onClick={restart}>
                New Post
              </Btn>
            </div>
          </div>

          {/* Split 2-Column Workspace Layout */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(310px, 350px) 1fr", gap: 28, alignItems: "start" }}>
            {/* Left: Smartphone Interactive Preview */}
            <div>
              <PhonePreview
                post={activePost}
                content={content}
                view={view}
                media={media}
                platform={platform.key}
              />
            </div>

            {/* Right: Interactive Editor & Media Studio */}
            <div style={{ display: "grid", gap: 20 }}>
              {/* Hook & Caption Edit */}
              <div style={{ display: "grid", gap: 10 }}>
                <div className="row between">
                  <label className="strong" style={{ fontSize: 14 }}>Post Caption & Hook</label>
                  <span className="small muted">{content.caption?.length || 0} / {pm.captionLimit || 2200}</span>
                </div>

                <textarea
                  className="big"
                  style={{ minHeight: 180, fontSize: 14.5 }}
                  value={content.caption || ""}
                  onChange={(e) => updateContent({ caption: e.target.value })}
                  placeholder="Post caption..."
                />

                {/* AI Revision Quick Chips */}
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="small muted" style={{ marginRight: 4 }}>AI Polish:</span>
                  {QUICK_REVISE.map((qr) => (
                    <button
                      key={qr.label}
                      type="button"
                      className="sa-chip"
                      disabled={!!busy}
                      style={{ height: 28, fontSize: 12, cursor: "pointer" }}
                      onClick={() => handleRevise(qr.prompt)}
                    >
                      <Icon name="sparkles" size={12} style={{ marginRight: 4 }} />
                      {qr.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Hashtags Section */}
              <div style={{ display: "grid", gap: 8 }}>
                <div className="row between">
                  <label className="strong" style={{ fontSize: 14 }}>
                    Real Hashtags ({(content.hashtags || []).length} / {pm.maxTags || 6})
                  </label>
                  <span className="small muted">Click to toggle</span>
                </div>

                {/* Active Hashtags Cloud */}
                <div className="sa-tagrow wrap" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(content.hashtags || []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="sa-igtag on"
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleHashtag(t)}
                      title="Click to remove"
                    >
                      {t} ×
                    </button>
                  ))}
                  {(!content.hashtags || content.hashtags.length === 0) && (
                    <span className="small muted">No hashtags selected. Click from researched hashtags below:</span>
                  )}
                </div>

                {/* Researched Hashtags Pool */}
                {realHashtagPool.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <span className="small muted" style={{ display: "block", marginBottom: 6 }}>
                      Discovered by {platform.label} researcher:
                    </span>
                    <div className="sa-tagrow wrap" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {realHashtagPool.map((tag) => {
                        const cleanTag = tag.startsWith("#") ? tag : `#${tag}`;
                        const isChosen = (content.hashtags || []).includes(cleanTag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={cx("sa-igtag", isChosen && "on")}
                            style={{ cursor: "pointer", opacity: isChosen ? 0.6 : 1 }}
                            onClick={() => toggleHashtag(cleanTag)}
                          >
                            {cleanTag} {isChosen ? "✓" : "+"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Add Custom Hashtag input */}
                <form onSubmit={addCustomHashtag} className="row" style={{ gap: 8, marginTop: 4 }}>
                  <input
                    className="sa-input"
                    style={{ height: 34, fontSize: 13, maxWidth: 220 }}
                    placeholder="Add custom hashtag..."
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                  />
                  <Btn size="sm" type="submit">Add Tag</Btn>
                </form>
              </div>

              {/* Media Section: Hidden if user already attached AI image in Step 1 */}
              {!(flow.preparedMedia?.length > 0 || (flow.mediaMode === "ai" && media.length > 0)) && (
                <div style={{ display: "grid", gap: 10, padding: 16, background: "var(--sa-bg)", borderRadius: 16 }}>
                  <div className="row between">
                    <label className="strong" style={{ fontSize: 14 }}>Post Media & Visuals</label>
                    <span className="small muted">
                      {media.length} media item{media.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Attached media list */}
                  {media.length > 0 && (
                    <div className="row wrap" style={{ gap: 10 }}>
                      {media.map((m, idx) => (
                        <div key={m.url || idx} style={{ position: "relative", width: 72, height: 72, borderRadius: 12, overflow: "hidden", border: "1px solid var(--sa-border)" }}>
                          {m.type === "video" ? (
                            <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveMedia(idx)}
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              background: "rgba(0,0,0,0.65)",
                              color: "#fff",
                              border: 0,
                              borderRadius: "50%",
                              width: 20,
                              height: 20,
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 12,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Visual Brief Idea */}
                  {content.visual?.brief && (
                    <div className="small muted" style={{ lineHeight: 1.5, background: "#fff", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--sa-border)" }}>
                      <b style={{ color: "var(--sa-ink)" }}>AI Visual Concept:</b> {content.visual.brief}
                      {content.visual.onImageText && (
                        <div style={{ marginTop: 4 }}>
                          <b>Text on Image:</b> "{content.visual.onImageText}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Media Action Buttons */}
                  <div className="row wrap" style={{ gap: 10 }}>
                    <Btn
                      icon="upload"
                      size="sm"
                      loading={busy === "upload"}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add Image from Machine
                    </Btn>
                    <Btn
                      icon="sparkles"
                      variant="primary"
                      size="sm"
                      onClick={() => setGenOpen(true)}
                    >
                      AI Generated Image
                    </Btn>
                  </div>
                </div>
              )}

              {/* Action Bar: Save, Approve, Publish, Schedule */}
              <div className="sa-step-foot" style={{ marginTop: 8 }}>
                <Btn
                  onClick={() => savePostChanges(true)}
                  loading={busy === "save"}
                >
                  Save Draft
                </Btn>

                <div className="row wrap" style={{ gap: 10 }}>
                  <Btn
                    icon="check"
                    onClick={handleApprove}
                    loading={busy === "approve"}
                    disabled={activePost.status === "approved" || activePost.status === "published"}
                  >
                    {activePost.status === "approved" || activePost.status === "scheduled" ? "Approved" : "Approve"}
                  </Btn>

                  <Btn
                    icon="calendar"
                    onClick={() => {
                      setWhen({ mode: "later", ...defaultSchedule(activePost.scheduledAt) });
                      setScheduleModalOpen(true);
                    }}
                    disabled={activePost.status === "published"}
                  >
                    Schedule for Later
                  </Btn>

                  <Btn
                    variant="grad"
                    icon="upload"
                    loading={busy === "publish"}
                    onClick={handlePublishNow}
                    disabled={activePost.status === "published"}
                  >
                    {activePost.status === "published" ? "Published" : `Publish to ${whereLabel}`}
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═════════════════════════════════════════════════════════════
          AI IMAGE GENERATOR MODAL
          ═════════════════════════════════════════════════════════════ */}
      {genOpen && (
        <ImageGenerator
          open={genOpen}
          onClose={() => setGenOpen(false)}
          post={activePost || { contentType: flow.format, content: { visual: { brief: flow.prompt } } }}
          platform={platform.key}
          productId={pid}
          productName={current?.aiProfile?.name || ""}
          contentType={activePost?.contentType || flow.format || "image"}
          onUse={(picked) => {
            handleAiImagesPicked(picked);
            setGenOpen(false);
          }}
        />
      )}

      {/* ═════════════════════════════════════════════════════════════
          SCHEDULE DATE & TIME MODAL
          ═════════════════════════════════════════════════════════════ */}
      {scheduleModalOpen && (
        <Modal
          title="Schedule Post"
          open={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <p className="lead" style={{ margin: 0 }}>
              Pick a date and time. Sociva will automatically publish this {typeLabel(activePost).toLowerCase()} to your {pm.where[placement]}.
            </p>

            <ScheduleFields
              value={when}
              onChange={setWhen}
              disabled={busy === "schedule"}
            />

            <div className="row end" style={{ gap: 10, marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => setScheduleModalOpen(false)}>Cancel</Btn>
              <Btn variant="primary" icon="calendar" loading={busy === "schedule"} onClick={handleScheduleSubmit}>
                Confirm Schedule
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ═════════════════════════════════════════════════════════════
          PROMPT REQUIRED POPUP MODAL
          ═════════════════════════════════════════════════════════════ */}
      {promptModalOpen && (
        <Modal
          title="Post Prompt Required"
          open={promptModalOpen}
          onClose={() => setPromptModalOpen(false)}
          width={540}
        >
          <form onSubmit={handleModalSubmit} style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fee2e2", display: "grid", placeItems: "center", flexShrink: 0, color: "#ef4444" }}>
                <Icon name="alert" size={20} />
              </div>
              <div>
                <span className="strong" style={{ fontSize: 14.5, color: "#b91c1c" }}>
                  Prompt Field is Required
                </span>
                <p className="small muted" style={{ margin: "4px 0 0", color: "#475569", lineHeight: 1.45 }}>
                  Please enter what you want your post to be about. The AI agent needs a prompt to research relevant hashtags, craft high-converting copy, and design your post visual.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div className="row between">
                <label className="strong" style={{ fontSize: 13.5 }}>
                  Describe your post concept or product <span className="red">*</span>
                </label>
                <span className={cx("small", popupPrompt.trim().length >= 10 ? "muted" : "red")}>
                  {popupPrompt.trim().length}/10 min characters
                </span>
              </div>
              <textarea
                className="big"
                autoFocus
                rows={4}
                value={popupPrompt}
                onChange={(e) => {
                  setPopupPrompt(e.target.value);
                  setFlow({ prompt: e.target.value });
                }}
                style={{
                  minHeight: 110,
                  fontSize: 14,
                  borderColor: popupPrompt.trim().length > 0 && popupPrompt.trim().length < 10 ? "#ef4444" : undefined,
                }}
                placeholder="e.g. Announce our weekend flash sale: 20% off all organic skincare products with code GLOW20. Highlight natural ingredients and fast shipping."
              />
            </div>

            {/* Quick Starter Inspiration */}
            <div>
              <span className="small muted" style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                💡 Or click a quick starter concept for {brandName}:
              </span>
              <div className="row wrap" style={{ gap: 6 }}>
                {[
                  { label: "🔥 Flash Sale", text: `Special limited-time flash sale for ${brandName}: get 20% off all orders this weekend with code FLASH20. Emphasize urgency and our bestsellers!` },
                  { label: "✨ New Arrival", text: `Introducing our latest product at ${brandName}! Highlight premium craftsmanship, unique benefits, and why our community loves it.` },
                  { label: "💡 Tips & Advice", text: `Top 3 essential tips for getting the best results with ${brandName}. Provide real value and invite followers to share their experience in comments.` },
                  { label: "⭐ Customer Spotlight", text: `Sharing a wonderful 5-star review from our happy customer for ${brandName}. Show appreciation and encourage new customers to try it today.` },
                ].map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    onClick={() => {
                      setPopupPrompt(idea.text);
                      setFlow({ prompt: idea.text });
                    }}
                    style={{
                      border: "1px solid var(--sa-border)",
                      background: "var(--sa-bg)",
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      fontWeight: 500,
                    }}
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="row end" style={{ gap: 10, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setPromptModalOpen(false)}>
                Cancel
              </Btn>
              <Btn
                type="submit"
                variant="grad"
                icon="sparkles"
                disabled={popupPrompt.trim().length < 10}
              >
                Generate Post with AI
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* ───── Hidden file input (always mounted so fileInputRef works on all steps) ───── */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,video/mp4,video/quicktime"
        onChange={handleFileUpload}
      />

      {/* ───── Modals ───── */}
      <CreateProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />

      <BrandKnowledgeModal
        open={knowledgeModalOpen}
        onClose={() => setKnowledgeModalOpen(false)}
        productId={pid}
        productName={brandName}
        onUpdated={refreshProducts}
      />
    </div>
  );
}
