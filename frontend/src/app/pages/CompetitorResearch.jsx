// ─────────────────────────────────────────────────────────────
// CompetitorResearch.jsx — /app/research (replaces Market Research)
//   1. Competitors : pick a platform, look up real accounts by username, confirm "this is my competitor"
//   2. Your product: Brand Brain product + what you want to achieve
//   3. Report      : REAL data (official API) + exact numbers (code) + AI analysis written ONLY from those numbers
//   4. Approve     : approve the report -> chosen ideas become draft posts (Studio pipeline) -> Editor -> publish
// AI Competitor Intelligence & Content Strategy Agent (multi-agent pipeline):
//   competitors by Manual selection (usernames / URLs, validated) or AI discovery (verified by the API),
//   then 12 agents run in the background with live progress (AgentPipeline) and the analytics (IntelligenceReport).
// Backend: /api/competitor-research (routes/competitorResearchRoutes.js, services/competitorIntelligence)
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import IgPostCard from "../ui/IgPostCard";
import FlowSteps from "../ui/FlowSteps";
import { Btn, Card, Empty, LiveTag, PageHeader, Pill, Segmented, Tabs, Toggle, cx, fmt, timeAgo, useToast } from "../ui/kit";
import { useWorkspace } from "../store";
import { PLATFORM_META, editorPath } from "../postUtils";
import {
  approveCompetitorReport, createBrief, getCompetitorReport, linkReportPost, postApi,
  listCompetitorPlatforms, listCompetitorReports, lookupCompetitor,
  cleanInstagramInput, listIntelAgents, startIntelPipeline, getPipelineProgress, analyzeReportResults,
} from "../api";
import DiscoveryPanel from "./competitor/DiscoveryPanel";
import AgentPipeline from "./competitor/AgentPipeline";
import IntelligenceReport from "./competitor/IntelligenceReport";

const STEPS = [
  { label: "Competitors", sub: "Platform + accounts" },
  { label: "Your product", sub: "Goal for this research" },
  { label: "Agents → report", sub: "Live pipeline + analytics" },
  { label: "Approve & create", sub: "Ideas → posts → publish" },
];
const FALLBACK_PLATFORMS = [
  { id: "instagram", name: "Instagram", implemented: true, searchHint: "Exact Instagram username of a Business or Creator account", metrics: [], notAvailable: [] },
  { id: "youtube", name: "YouTube", implemented: true, searchHint: "YouTube handle (@channel), channel name, URL or Channel ID", metrics: [], notAvailable: [] },
  { id: "facebook", name: "Facebook", implemented: true, searchHint: "Facebook Page username, Page id or link, e.g. amul.coop or facebook.com/amul.coop", metrics: [], notAvailable: [] },
  ...[["x", "X"], ["threads", "Threads"], ["pinterest", "Pinterest"], ["tiktok", "TikTok"], ["linkedin", "LinkedIn"]]
    .map(([id, name]) => ({ id, name, implemented: false, notes: [] })),
];
const STATUS = { running: ["blue", "Running"], completed: ["green", "Completed"], partial: ["amber", "Partial"], failed: ["red", "Failed"] };
const PRI = { high: "red", medium: "amber", low: "gray" };
const FORMAT_LABEL = { reel: "Reel", carousel: "Carousel", image: "Photo", video: "Video" };
const pct = (v) => (v == null ? "—" : `${v}%`);

function ProfileCard({ c, action }) {
  return (
    <div className="sa-li" style={{ alignItems: "flex-start", gap: 14 }}>
      {c.profilePictureUrl ? <img className="sa-profile-pic" src={c.profilePictureUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sa-profile-pic" />}
      <span className="grow" style={{ minWidth: 0 }}>
        <b>@{c.username}</b> {c.name && <span className="muted">· {c.name}</span>}
        <small style={{ display: "block" }}>{fmt(c.followers)} {c.totalViews != null ? "subscribers" : "followers"} · {fmt(c.mediaCount)} {c.totalViews != null ? "videos" : "posts"}{c.totalViews != null && <> · {fmt(c.totalViews)} views</>}{c.engagementRate != null && <> · {c.engagementRate}% engagement</>}</small>
        {c.biography && <small className="faint" style={{ display: "block", marginTop: 4 }}>{c.biography.slice(0, 160)}</small>}
        {c.recentPosts?.length > 0 && (
          <span className="row mt-s" style={{ gap: 6 }}>
            {c.recentPosts.map((p) => (
              <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer" title={`${fmt(p.likes)} likes · ${fmt(p.comments)} comments`}
                style={{ width: 54, height: 54, borderRadius: 10, overflow: "hidden", background: "#f1f1f7", display: "grid", placeItems: "center" }}>
                {p.imageUrl ? <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" size={18} />}
              </a>
            ))}
          </span>
        )}
      </span>
      {action}
    </div>
  );
}

export default function CompetitorResearch() {
  const { current, profile, online } = useWorkspace();
  const pid = current?._id;
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [platforms, setPlatforms] = useState(FALLBACK_PLATFORMS);
  const [maxCompetitors, setMaxCompetitors] = useState(5);
  const [platform, setPlatform] = useState("instagram");
  const meta = platforms.find((p) => p.id === platform) || platforms[0];

  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [found, setFound] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [selected, setSelected] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [approving, setApproving] = useState(false);
  const [ideaSel, setIdeaSel] = useState(() => new Set());
  const [creating, setCreating] = useState({}); // ideaIndex -> "busy" | "error:..."
  // multi-agent pipeline
  const [method, setMethod] = useState("manual");        // manual | discovery
  const [useAI, setUseAI] = useState(true);              // false = 0 LLM calls
  const [live, setLive] = useState(null);                // { id, status, pipeline } while the agents run
  const [agentsMeta, setAgentsMeta] = useState([]);      // agents + skill files
  const [reportTab, setReportTab] = useState("analytics");
  const [analyzing, setAnalyzing] = useState(false);
  const [bulk, setBulk] = useState("");
  const [bulkRows, setBulkRows] = useState([]);          // [{ input, username, status, data, error }]
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => { listCompetitorPlatforms().then((r) => { if (r.data?.length) setPlatforms(r.data); if (r.maxCompetitors) setMaxCompetitors(r.maxCompetitors); }).catch(() => { }); }, []);
  useEffect(() => { listIntelAgents().then(setAgentsMeta).catch(() => { }); }, []);
  const refreshHistory = () => pid && listCompetitorReports(pid).then(setHistory).catch(() => setHistory([]));
  useEffect(() => { setHistory([]); refreshHistory(); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // open a saved report: /app/research?report=<id>
  const reportId = params.get("report");
  useEffect(() => {
    if (!reportId || report?._id === reportId || live?.id === reportId) return;
    getCompetitorReport(reportId).then((r) => {
      if (r.status === "running") { setReport(null); setLive({ id: r._id, status: "running", pipeline: r.pipeline }); }
      else { setReport(r); setReportTab(r.intelligence ? "analytics" : "report"); }
      setStep(2);
    }).catch((e) => toast(e.message, "error"));
  }, [reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  // poll the live agent progress while the pipeline runs
  useEffect(() => {
    if (!live?.id || live.status !== "running") return undefined;
    const id = live.id;
    let stop = false, timer;
    const tick = async () => {
      try {
        const p = await getPipelineProgress(id);
        if (stop) return;
        if (p.status === "running") { setLive({ id, status: "running", pipeline: p.pipeline }); timer = setTimeout(tick, 1000); return; }
        const r = await getCompetitorReport(id);
        if (stop) return;
        setLive(null); setReport(r); setReportTab(r.intelligence ? "analytics" : "report"); setIdeaSel(new Set()); setCreating({});
        refreshHistory();
        toast(r.status === "failed" ? `Research failed: ${r.error}` : "All agents finished — report ready", r.status === "failed" ? "error" : "success");
      } catch {
        if (!stop) timer = setTimeout(tick, 2500);
      }
    };
    timer = setTimeout(tick, 500);
    return () => { stop = true; clearTimeout(timer); };
  }, [live?.id, live?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const reached = report ? 3 : live ? 2 : selected.length ? 1 : 0;

  /* ── 1. look up a competitor ── */
  const lookup = async (pf) => {
    const on = typeof pf === "string" ? pf : platform; // onClick passes an event
    const u = cleanInstagramInput(query);
    if (!u) return;
    setLookupBusy(true); setFound(null); setLookupError("");
    try {
      setFound(await lookupCompetitor(on, u));
    } catch (e) {
      setLookupError(e.message);
    } finally {
      setLookupBusy(false);
    }
  };
  const addCompetitor = (c) => {
    if (selected.some((s) => s.username === c.username)) return;
    if (selected.length >= maxCompetitors) { toast(`Max ${maxCompetitors} competitors per report`, "error"); return; }
    setSelected((l) => [...l, c]); setFound(null); setQuery("");
  };
  const addMany = (list) => {
    const have = new Set(selected.map((s) => s.username));
    const fresh = list.filter((c) => !have.has(c.username)).slice(0, Math.max(0, maxCompetitors - selected.length));
    if (!fresh.length) { toast(selected.length >= maxCompetitors ? `Max ${maxCompetitors} competitors per report` : "Already added", "error"); return; }
    setSelected((l) => [...l, ...fresh]);
    toast(`${fresh.length} competitor${fresh.length === 1 ? "" : "s"} added`, "success");
  };
  const choosePlatform = (id) => { setPlatform(id); setFound(null); setLookupError(""); setSelected([]); if (id !== "instagram") setMethod("manual"); };

  /* ── validate a pasted list of usernames / URLs (one Business Discovery call each) ── */
  const validateBulk = async () => {
    const inputs = [...new Set(bulk.split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean))].slice(0, maxCompetitors);
    if (!inputs.length) return;
    setBulkBusy(true);
    const rows = inputs.map((input) => ({ input, username: cleanInstagramInput(input), status: "checking" }));
    setBulkRows(rows);
    for (let i = 0; i < rows.length; i++) {
      try { rows[i] = { ...rows[i], status: "ok", data: await lookupCompetitor(platform, rows[i].username) }; }
      catch (e) { rows[i] = { ...rows[i], status: "error", error: e.message }; }
      setBulkRows([...rows]);
    }
    setBulkBusy(false);
  };

  /* ── 2. run the research ── */
  const run = async () => {
    if (!pid) { toast("Train your Brand Brain first", "error"); return; }
    setRunning(true);
    try {
      const r = await startIntelPipeline({ productId: pid, platform, competitors: selected.map((s) => s.username), prompt, useAI, method });
      setReport(null); setIdeaSel(new Set()); setCreating({});
      setLive({ id: r._id, status: "running", pipeline: r.pipeline });
      setStep(2);
      setParams({ report: r._id }, { replace: true });
      refreshHistory();
      toast("Agents started — watch them work", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setRunning(false);
    }
  };

  /* ── 4. approve + create posts ── */
  const approve = async () => {
    setApproving(true);
    try {
      const r = await approveCompetitorReport(report._id);
      setReport(r); refreshHistory();
      toast("Report approved — choose ideas to turn into posts", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setApproving(false);
    }
  };

  const ideas = report?.analysis?.contentIdeas || [];
  const postFor = (i) => (report?.posts || []).find((p) => p.ideaIndex === i);
  const qcFor = (i) => (report?.intelligence?.quality?.results || []).find((q) => q.ideaIndex === i);
  const briefFor = (i) => (report?.intelligence?.briefs || []).find((b) => b.ideaIndex === i);
  const reportPlatform = PLATFORM_META[report?.platform] ? report.platform : "instagram";
  const createPosts = async () => {
    let r = report;
    for (const i of [...ideaSel].sort((a, b) => a - b)) {
      if (postFor(i)) continue;
      const idea = ideas[i];
      setCreating((c) => ({ ...c, [i]: "busy" }));
      try {
        const userPrompt = [
          `${PLATFORM_META[reportPlatform].label} ${idea.format} for ${profile?.name || "our product"}: ${idea.title}.`,
          idea.hook && `Hook: ${idea.hook}.`,
          idea.angle && `Angle: ${idea.angle}.`,
          idea.basedOn && `Why (competitor research): ${idea.basedOn}.`,
          briefFor(i) && `Creative brief: ${briefFor(i).spec?.ratio || ""} ${briefFor(i).spec?.length || ""}. Structure: ${briefFor(i).structure.join(" / ")}. Caption: ${briefFor(i).caption.length}${briefFor(i).caption.includeQuestion ? ", end with a question" : ""}; CTA: ${briefFor(i).caption.cta}.`,
          report.prompt && `Our goal: ${report.prompt}`,
        ].filter(Boolean).join(" ");
        const brief = (await createBrief({ productId: pid, userPrompt })).data;
        const research = { ...report.data.postResearch, hashtags: [...(idea.hashtags || []).map((h) => ({ hashtag: h })), ...(report.data.postResearch?.hashtags || [])].filter((h, k, a) => a.findIndex((x) => x.hashtag === h.hashtag) === k) };
        const g = await postApi(reportPlatform).generatePost({ productId: pid, brief, research, contentType: idea.format });
        r = await linkReportPost(report._id, { ideaIndex: i, postId: g.data._id });
        setReport(r);
        setCreating((c) => ({ ...c, [i]: undefined }));
      } catch (e) {
        setCreating((c) => ({ ...c, [i]: `error:${e.message}` }));
      }
    }
    setIdeaSel(new Set());
    toast("Draft posts created — review, approve and publish them in the Editor", "success");
  };

  const analyzeResults = async () => {
    setAnalyzing(true);
    try { setReport(await analyzeReportResults(report._id)); toast("Results analysed", "success"); }
    catch (e) { toast(e.message, "error"); }
    finally { setAnalyzing(false); }
  };

  const newReport = () => { setReport(null); setLive(null); setStep(0); setParams({}, { replace: true }); };

  if (!current) {
    return (
      <>
        <PageHeader title="Competitor research" sub="Real competitor data → gaps → ideas → posts." />
        <Card><Empty icon="brain" title={online === false ? "Backend offline" : "Train your Brand Brain first"} action={online !== false && <Btn variant="primary" to="/onboarding">Start onboarding</Btn>}>
          The research compares your product with your competitors, so we need your product first.
        </Empty></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={<>Competitor research</>}
        sub={<>Pick your competitors, and we compare them with <b className="strong">{profile?.name}</b> using real platform data — then turn the gaps into posts.</>}>
        {(report || live) && <Btn icon="plus" onClick={newReport}>New research</Btn>}
      </PageHeader>

      <FlowSteps steps={STEPS} current={step} reached={reached} onStep={running ? undefined : setStep} />

      {/* ───── 1 · Competitors ───── */}
      {step === 0 && (
        <div className="mt">
          <Card title="1 · Choose the platform and your competitors" sub="We only use official platform APIs — real numbers, no guessing.">
            <div className="row wrap" style={{ gap: 8 }} role="radiogroup" aria-label="Platform">
              {platforms.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={platform === p.id} onClick={() => choosePlatform(p.id)}
                  className={cx("sa-chip", platform === p.id && "on")} style={{ opacity: p.implemented ? 1 : 0.7 }}>
                  <PlatformIcon platform={p.id} size={20} />{p.name}{!p.implemented && <Pill tone="gray">Soon</Pill>}
                </button>
              ))}
            </div>

            {!meta?.implemented ? (
              <div className="sa-banner tone-amber mt" style={{ alignItems: "flex-start" }}>
                <Icon name="plug" style={{ color: "#f59e0b" }} />
                <div className="small"><b className="strong">{meta?.name} isn't connected yet.</b> {(meta?.notes || []).join(" ")} Instagram is live today.</div>
              </div>
            ) : (
              <>
                {platform === "instagram" && (
                  <div className="row wrap mt" style={{ gap: 12 }}>
                    <Segmented value={method} onChange={setMethod} options={[
                      { value: "manual", label: "Manual selection", icon: "at" },
                      { value: "discovery", label: "AI-powered discovery", icon: "sparkles" },
                    ]} />
                    <span className="small muted">{method === "manual" ? "Enter usernames or profile URLs — we validate each with the Instagram API." : "We find competitors from your brand context and verify every one with the Instagram API."}</span>
                  </div>
                )}
                {method === "discovery" && platform === "instagram" ? (
                  <DiscoveryPanel productId={pid} profile={profile} selected={selected} max={maxCompetitors} onAdd={addCompetitor} onAddMany={addMany} />
                ) : <>
                  <div className="sa-prompt row mt" style={{ padding: "10px 10px 10px 18px" }}>
                    <Icon name={platform === "youtube" ? "video" : "at"} size={19} style={{ color: "var(--sa-primary)" }} />
                    <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()}
                      placeholder={platform === "youtube" ? "YouTube channel handle or URL, e.g. @mkbhd, @mrbeast, or youtube.com/@amul_india" : "Competitor username or URL, e.g. bluetokaicoffee or instagram.com/bluetokaicoffee"} aria-label="Competitor username"
                      style={{ border: 0, outline: 0, fontSize: 16, height: 42, background: "none" }} />
                    <Btn variant="grad" icon="search" onClick={lookup} loading={lookupBusy}>Search</Btn>
                  </div>
                  <p className="small faint" style={{ margin: "8px 4px 0" }}>{meta.searchHint}. {meta.name} has no official search by brand name — open their profile and copy the username.</p>

                  {meta.implemented && meta.notes?.length > 0 && <p className="small faint" style={{ margin: "4px 4px 0" }}>{meta.notes.join(" ")}</p>}
                  {lookupError && <div className="sa-banner tone-red mt"><Icon name="alert" /><div className="small grow">{lookupError}</div>
                    {platform === "facebook" && /Public Content Access/i.test(lookupError) && <Btn size="sm" onClick={() => { choosePlatform("instagram"); lookup("instagram"); }}>Search "{query.trim().replace(/^@/, "")}" on Instagram</Btn>}</div>}
                  {found && (
                    <div className="mt" style={{ border: "1px solid var(--sa-border)", borderRadius: 16, padding: 14 }}>
                      <ProfileCard c={found} action={
                        selected.some((s) => s.username === found.username)
                          ? <Pill tone="green" icon="check">Added</Pill>
                          : <Btn variant="primary" icon="check" onClick={() => addCompetitor(found)}>Yes, this is my competitor</Btn>
                      } />
                    </div>
                  )}

                  {(platform === "instagram" || platform === "youtube") && (
                    <details className="mt" open={bulkRows.length > 0}>
                      <summary className="small strong" style={{ cursor: "pointer" }}>Add many at once — paste {platform === "youtube" ? "channel handles or URLs" : "usernames or profile URLs"} (one per line, up to {maxCompetitors})</summary>
                      <textarea className="sa-input mt-s" rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} style={{ height: "auto", padding: 12, lineHeight: 1.6, width: "100%" }}
                        placeholder={platform === "youtube" ? "@mkbhd\nhttps://www.youtube.com/@mrbeast\n@veritasium" : "@competitor_coffee_1\nhttps://www.instagram.com/competitor_coffee_2/\ncompetitor_coffee_3"} aria-label="Usernames or URLs" />
                      <div className="row mt-s" style={{ gap: 8, justifyContent: "flex-end" }}>
                        {bulkRows.some((r) => r.status === "ok") && <Btn icon="userPlus" onClick={() => addMany(bulkRows.filter((r) => r.status === "ok").map((r) => r.data))}>Add {bulkRows.filter((r) => r.status === "ok").length} valid</Btn>}
                        <Btn variant="primary" icon="shieldCheck" loading={bulkBusy} onClick={validateBulk} disabled={!bulk.trim()}>Validate profiles</Btn>
                      </div>
                      {bulkRows.length > 0 && (
                        <div className="sa-list mt-s">
                          {bulkRows.map((r) => (
                            <div key={r.input} className="sa-li small">
                              {r.status === "ok" ? <Pill tone="green" icon="shieldCheck">Valid</Pill> : r.status === "error" ? <Pill tone="red" icon="alert">Not available</Pill> : <Pill tone="blue">Checking…</Pill>}
                              <span className="grow"><b style={{ display: "inline" }}>@{r.username}</b>{r.data && <span className="muted"> · {r.data.name} · {fmt(r.data.followers)} followers · {fmt(r.data.mediaCount)} posts</span>}{r.error && <span className="red"> · {r.error}</span>}</span>
                              {r.status === "ok" && (selected.some((x) => x.username === r.data.username) ? <Pill tone="green" icon="check">Added</Pill> : <Btn size="sm" icon="plus" onClick={() => addCompetitor(r.data)}>Add</Btn>)}
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  )}
                </>}
              </>
            )}
          </Card>

          <Card className="mt" title={`Your competitors (${selected.length}/${maxCompetitors})`} sub={`Confirm 1–${maxCompetitors} accounts. Each one gets its own Competitor Research Agent.`}
            action={selected.length > 0 && <Btn size="sm" variant="ghost" icon="trash" onClick={() => setSelected([])}>Clear</Btn>}>
            {selected.length ? (
              <div className="sa-list">
                {selected.map((c) => (
                  <ProfileCard key={c.username} c={c} action={<Btn size="sm" icon="x" onClick={() => setSelected((l) => l.filter((x) => x.username !== c.username))}>Remove</Btn>} />
                ))}
              </div>
            ) : <p className="muted small" style={{ margin: 0 }}>Search a username above and click “Yes, this is my competitor”.</p>}
            <div className="row mt" style={{ justifyContent: "flex-end" }}>
              <Btn variant="primary" iconRight="arrowRight" disabled={!selected.length} onClick={() => setStep(1)}>Next: your product</Btn>
            </div>
          </Card>

          {history.length > 0 && (
            <Card className="mt" title="Saved reports">
              <div className="sa-list">
                {history.map((h) => (
                  <button key={h._id} type="button" className="sa-li" style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }}
                    onClick={() => setParams({ report: h._id })}>
                    <PlatformIcon platform={h.platform} size={28} />
                    <span className="grow"><b className="ellipsis">{h.competitors.map((u) => `@${u}`).join(", ")}</b><small>{new Date(h.createdAt).toLocaleString()} · {h.competitors.length} competitors · {h.posts?.length || 0} posts created{h.method === "discovery" ? " · AI discovery" : ""}{h.useAI === false ? " · 0 LLM calls" : ""}</small></span>
                    <Pill tone={STATUS[h.status]?.[0]}>{STATUS[h.status]?.[1]}</Pill>
                    <Pill tone={h.approval?.status === "approved" ? "green" : "gray"}>{h.approval?.status === "approved" ? "Approved" : "Draft"}</Pill>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ───── 2 · Your product ───── */}
      {step === 1 && (
        <div className="sa-grid g-main-r mt">
          <Card title="2 · Your product and goal" sub="The AI uses this to judge which gaps matter for you.">
            <div className="sa-li" style={{ background: "#f7f6ff", borderRadius: 14, padding: 14 }}>
              <span className="sa-ic tone-violet"><Icon name="brain" size={18} /></span>
              <span className="grow"><b>{profile?.name}</b><small>{profile?.category}{profile?.description ? ` · ${profile.description.slice(0, 140)}` : ""}</small></span>
            </div>
            <label className="sa-field mt">
              <span className="sa-field-label">What do you want from this research? (optional)</span>
              <textarea className="sa-input" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ height: "auto", padding: 14, lineHeight: 1.6 }}
                placeholder="e.g. We sell A2 desi ghee in 500 ml jars. We want more engagement and sales from young families in Tier-2 cities. What are they doing that we are not?" />
            </label>
            <div className="sa-li mt" style={{ border: "1px solid var(--sa-border)", borderRadius: 14, padding: 12 }}>
              <Toggle checked={useAI} onChange={setUseAI} label="AI writing" />
              <span className="grow"><b>AI writing — {useAI ? "on (1 LLM call)" : "off (0 LLM calls)"}</b>
                <small>{useAI ? "One grounded call writes the positioning, insights and post ideas from the computed numbers. Everything else is real API data + code." : "Every agent runs on real API data + code only. Ideas come from the opportunity templates in the skill files."}</small></span>
            </div>
            <div className="row mt" style={{ justifyContent: "space-between" }}>
              <Btn icon="arrowLeft" onClick={() => setStep(0)} disabled={running}>Back</Btn>
              <Btn variant="grad" icon="rocket" onClick={run} loading={running} disabled={!selected.length || platform !== "instagram"}>Start {selected.length} research agent{selected.length === 1 ? "" : "s"}</Btn>
            </div>
            {platform !== "instagram" && <p className="small red mt-s" style={{ marginBottom: 0 }}>The agent pipeline runs on Instagram.</p>}
          </Card>
          <Card title="What we analyze">
            <div className="small muted" style={{ marginBottom: 8 }}>Comparing <b className="strong">{selected.map((s) => `@${s.username}`).join(", ")}</b> with your own account.</div>
            <div className="sa-section-label">Real data ({meta?.source || meta?.name})</div>
            <div className="sa-chipset" style={{ margin: "6px 0 12px" }}>{(meta?.metrics || []).map((m) => <Pill key={m} tone="green">{m}</Pill>)}</div>
            {meta?.notAvailable?.length > 0 && <>
              <div className="sa-section-label">Not available from the API</div>
              <div className="sa-chipset" style={{ margin: "6px 0 12px" }}>{meta.notAvailable.map((m) => <Pill key={m} tone="gray">{m}</Pill>)}</div>
            </>}
            <p className="small faint" style={{ margin: 0 }}>12 agents run automatically: Orchestrator → Competitor Research (one per brand) → Data Collection → Post ‖ Comment Analysis → Performance → Gaps → Opportunities → Strategy → Ideas → Briefs → Quality Check. Approval, image/video creation, publishing and results analysis follow your actions.</p>
          </Card>
        </div>
      )}

      {/* ───── 3 · Report ───── */}
      {step === 2 && live && <AgentPipeline pipeline={live.pipeline} agentsMeta={agentsMeta} running useAI={useAI} title="Agents at work" />}
      {step === 2 && !live && report && (
        <div className="mt">
          <Tabs value={reportTab} onChange={setReportTab} options={[
            ...(report.intelligence ? [{ value: "analytics", label: "Agent analytics" }] : []),
            { value: "report", label: "Report" },
            ...(report.pipeline ? [{ value: "agents", label: "Agents" }] : []),
          ]} />
          {reportTab === "analytics" && report.intelligence && <>
            <IntelligenceReport report={report} onAnalyzeResults={analyzeResults} analyzing={analyzing} />
            <div className="row mt" style={{ justifyContent: "flex-end" }}><Btn variant="primary" iconRight="arrowRight" onClick={() => setStep(3)}>Next: approve & create</Btn></div>
          </>}
          {reportTab === "report" && <Report report={report} onNext={() => setStep(3)} />}
          {reportTab === "agents" && report.pipeline && <AgentPipeline pipeline={report.pipeline} agentsMeta={agentsMeta} useAI={report.useAI !== false} title="Agent pipeline" />}
        </div>
      )}
      {step === 2 && !report && !live && <Card className="mt"><Empty icon="file" title="No report yet">Choose competitors and run the research first.</Empty></Card>}

      {/* ───── 4 · Approve & create ───── */}
      {step === 3 && report && (
        <div className="mt">
          <Card title="4 · Approve the report" sub="Only approved reports can create posts.">
            {report.approval?.status === "approved" ? (
              <div className="row"><Pill tone="green" icon="checkCircle">Approved {timeAgo(report.approval.approvedAt)}</Pill><span className="small muted">Pick ideas below to turn them into draft posts.</span></div>
            ) : (
              <div className="row wrap" style={{ justifyContent: "space-between" }}>
                <span className="small muted">Check the numbers and the analysis in the report. When you agree with it, approve it.</span>
                <span className="row"><Btn icon="arrowLeft" onClick={() => setStep(2)}>Back to report</Btn><Btn variant="primary" icon="check" onClick={approve} loading={approving}>Approve report</Btn></span>
              </div>
            )}
          </Card>

          <Card className="mt" title="Content ideas from the gaps" sub="Each idea becomes a draft post with your competitors' real hashtags. Then review → approve → publish in the Editor.">
            {!ideas.length ? <p className="muted">The AI analysis didn't produce ideas for this report{report.analysisError ? ` (${report.analysisError})` : ""}.</p> : (
              <div className="sa-list">
                {ideas.map((idea, i) => {
                  const done = postFor(i);
                  const st = creating[i];
                  const can = report.approval?.status === "approved" && !done;
                  return (
                    <div key={i} className="sa-li" style={{ alignItems: "flex-start", cursor: can ? "pointer" : "default", opacity: report.approval?.status === "approved" ? 1 : 0.6 }}
                      onClick={() => can && setIdeaSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                      <span className={cx("sa-check", (ideaSel.has(i) || done) && "on")} style={{ marginTop: 3 }}>{(ideaSel.has(i) || done) && <Icon name="check" size={14} stroke={3} />}</span>
                      <span className="grow">
                        <b>{idea.title}</b> <Pill tone="violet">{FORMAT_LABEL[idea.format] || idea.format}</Pill>{idea.pillar && <Pill tone="outline" style={{ marginLeft: 4 }}>{idea.pillar}</Pill>}
                        {qcFor(i) && <Pill tone={qcFor(i).pass ? "green" : "amber"} icon="shieldCheck" style={{ marginLeft: 4 }}>QC {qcFor(i).score}</Pill>}
                        {idea.hook && <small style={{ display: "block" }}>Hook: “{idea.hook}”</small>}
                        {idea.angle && <small style={{ display: "block" }}>{idea.angle}</small>}
                        {idea.basedOn && <small className="faint" style={{ display: "block" }}><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {idea.basedOn}</small>}
                        {idea.hashtags?.length > 0 && <span className="sa-chipset mt-s">{idea.hashtags.map((h) => <span key={h} className="sa-igtag">{h}</span>)}</span>}
                        {st?.startsWith("error:") && <small className="red" style={{ display: "block" }}>{st.slice(6)}</small>}
                      </span>
                      {st === "busy" && <Pill tone="blue">Writing…</Pill>}
                      {done && <Btn size="sm" icon="pen" to={editorPath({ _id: done.postId, platform: reportPlatform })} onClick={(e) => e.stopPropagation()}>Open draft</Btn>}
                    </div>
                  );
                })}
              </div>
            )}
            {report.approval?.status === "approved" && ideas.length > 0 && (
              <div className="row mt" style={{ justifyContent: "flex-end", gap: 8 }}>
                <Btn icon="pipeline" to="/app/pipeline">Publishing pipeline</Btn>
                <Btn variant="grad" icon="sparkles" disabled={!ideaSel.size || Object.values(creating).includes("busy")} loading={Object.values(creating).includes("busy")} onClick={createPosts}>
                  Create {ideaSel.size || ""} draft post{ideaSel.size === 1 ? "" : "s"}
                </Btn>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/* ───────── the report (step 3) ───────── */
function Report({ report, onNext }) {
  const d = report.data || {};
  const a = report.analysis;
  const cmp = d.comparison || {};
  const accounts = useMemo(() => [...(d.me ? [{ ...d.me, you: true }] : []), ...(d.accounts || [])], [d]);
  const [copied, setCopied] = useState(false);

  if (report.status === "failed") {
    return <div className="sa-banner tone-red mt"><span className="sa-banner-ic"><Icon name="alert" /></span><div className="sa-banner-body"><h4>Research failed</h4><p>{report.error}</p></div></div>;
  }
  const copyTags = (tags) => { navigator.clipboard?.writeText(tags.join(" ")); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="mt">
      <div className="sa-card row wrap" style={{ gap: 16 }}>
        <span className="sa-ic lg tone-grad"><Icon name="target" size={22} /></span>
        <div className="grow">
          <div className="row wrap"><h3 style={{ fontSize: 18 }}>Competitor report · {report.productName}</h3>
            <Pill tone={STATUS[report.status]?.[0]}>{STATUS[report.status]?.[1]}</Pill>
            <Pill tone={report.approval?.status === "approved" ? "green" : "gray"}>{report.approval?.status === "approved" ? "Approved" : "Draft"}</Pill>
          </div>
          <div className="small muted mt-s">{(d.accounts || []).map((c) => `@${c.profile.username}`).join(", ")} · {d.source} · fetched {timeAgo(d.fetchedAt)}{report.durationMs ? ` · took ${Math.round(report.durationMs / 1000)}s` : ""}</div>
        </div>
        <Btn variant="primary" iconRight="arrowRight" onClick={onNext}>Next: approve & create</Btn>
      </div>

      {d.failed?.length > 0 && <div className="sa-banner tone-amber mt"><Icon name="alert" style={{ color: "#f59e0b" }} /><div className="small">Not included: {d.failed.map((f) => `@${f.username} (${f.error})`).join(" · ")}</div></div>}
      {report.analysisError && <div className="sa-banner tone-amber mt"><Icon name="alert" style={{ color: "#f59e0b" }} /><div className="small"><b className="strong">The AI analysis failed:</b> {report.analysisError}. All real data below is complete.</div></div>}

      {a?.summary && (
        <Card className="mt" title={<>Summary <Pill tone="violet" icon="sparkles">AI, from the real numbers below</Pill></>}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>{a.summary}</p>
        </Card>
      )}

      {/* benchmark — real numbers */}
      <Card className="mt" title="You vs competitors" sub={`Real data from each account's last ${Math.max(...accounts.map((x) => x.postsAnalyzed || 0), 0)} posts. Engagement = likes + comments.`}>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>Account</th><th>Followers</th><th>Posts</th><th>Avg likes</th><th>Avg comments</th><th>Eng. rate</th><th>Posts / week</th><th>Best format</th><th>Best days</th></tr></thead>
            <tbody>
              {accounts.map((x) => (
                <tr key={(x.you ? "me:" : "") + x.profile.username} style={x.you ? { background: "#f7f6ff" } : undefined}>
                  <td><b style={{ color: "var(--sa-primary)" }}>@{x.profile.username}</b>{x.you && <Pill tone="violet" style={{ marginLeft: 6 }}>you</Pill>}{cmp.leader?.username === x.profile.username && <Pill tone="green" style={{ marginLeft: 6 }}>leader</Pill>}</td>
                  <td className="num">{fmt(x.profile.followers)}</td>
                  <td className="num">{x.postsAnalyzed}</td>
                  <td className="num">{fmt(x.avgLikes)}</td>
                  <td className="num">{fmt(x.avgComments)}</td>
                  <td className="num"><b className="strong">{pct(x.engagementRate)}</b></td>
                  <td className="num">{x.postsPerWeek ?? "—"}</td>
                  <td>{FORMAT_LABEL[x.bestFormat] || "—"}</td>
                  <td className="small">{x.bestDays?.map((b) => b.key).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!d.me && <p className="small faint" style={{ marginBottom: 0 }}>Your own account wasn't available, so this compares competitors only.</p>}
      </Card>

      {/* gaps + actions — AI with evidence */}
      {a && (
        <div className="sa-grid g-2 mt">
          <Card title={<>Gaps & opportunities <Pill tone="violet" icon="sparkles">AI</Pill></>} sub="Each one is backed by real data.">
            <div className="sa-list">
              {a.gaps.map((g) => (
                <div key={g.title} className="sa-li" style={{ alignItems: "flex-start" }}>
                  <span className="sa-ic tone-amber"><Icon name="bulb" size={17} /></span>
                  <span className="grow"><b>{g.title}</b><small style={{ display: "block" }}>{g.detail}</small><small className="faint" style={{ display: "block" }}><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {g.evidence}</small></span>
                </div>
              ))}
            </div>
          </Card>
          <Card title={<>What to do <Pill tone="violet" icon="sparkles">AI</Pill></>} sub="Sorted by priority.">
            <div className="sa-list">
              {a.actions.map((x) => (
                <div key={x.action} className="sa-li" style={{ alignItems: "flex-start" }}>
                  <Pill tone={PRI[x.priority]}>{x.priority}</Pill>
                  <span className="grow"><b>{x.action}</b><small className="faint" style={{ display: "block" }}><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {x.evidence}</small></span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* hashtags */}
      <div className="sa-grid g-2 mt">
        <Card title="Hashtag gap" sub={d.me ? "Hashtags your competitors use that you don't (real posts)." : "Hashtags your competitors use (real posts)."}>
          {cmp.hashtagGap?.length ? (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead><tr><th>Hashtag</th><th>Used by</th><th>Posts</th><th>Avg eng.</th></tr></thead>
                <tbody>{cmp.hashtagGap.slice(0, 15).map((h) => (
                  <tr key={h.hashtag}><td><b style={{ color: "var(--sa-primary)" }}>{h.hashtag}</b></td><td className="small">{h.usedBy.map((u) => `@${u}`).join(", ")}</td><td className="num">{h.posts}</td><td className="num">{fmt(h.avgEngagement)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="muted small">No hashtag gap found.</p>}
        </Card>
        <Card title={<>Hashtag plan {a && <Pill tone="violet" icon="sparkles">AI</Pill>}</>} sub="Only hashtags that appear in real posts."
          action={a?.hashtagPlan?.use?.length > 0 && <Btn size="sm" icon="copy" onClick={() => copyTags(a.hashtagPlan.use)}>{copied ? "Copied" : "Copy"}</Btn>}>
          {a?.hashtagPlan?.use?.length ? <>
            <div className="sa-chipset">{a.hashtagPlan.use.map((h) => <span key={h} className="sa-igtag">{h}</span>)}</div>
            {a.hashtagPlan.why && <p className="small muted" style={{ marginBottom: 0 }}>{a.hashtagPlan.why}</p>}
          </> : <div className="sa-chipset">{(cmp.sharedHashtags || []).slice(0, 15).map((h) => <span key={h.hashtag} className="sa-igtag">{h.hashtag}</span>)}</div>}
          {a?.grounding?.removedHashtags > 0 && <p className="small faint" style={{ marginBottom: 0 }}>{a.grounding.removedHashtags} AI-suggested hashtags were removed because they don't appear in real posts.</p>}
        </Card>
      </div>

      {/* formats + captions */}
      <div className="sa-grid g-2 mt">
        <Card title="Formats that work" sub="Share of posts and average engagement per format.">
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Format</th><th>Competitors use</th><th>Their avg eng.</th>{d.me && <><th>You use</th><th>Your avg eng.</th></>}</tr></thead>
              <tbody>{(cmp.formatGap || []).map((f) => (
                <tr key={f.format}><td><b>{FORMAT_LABEL[f.format] || f.format}</b></td><td className="num">{pct(f.competitorShare)}</td><td className="num">{fmt(f.competitorAvgEngagement)}</td>
                  {d.me && <><td className="num">{pct(f.yourShare)}</td><td className="num">{fmt(f.yourAvgEngagement)}</td></>}</tr>
              ))}</tbody>
            </table>
          </div>
          {cmp.commonBestDays?.length > 0 && <p className="small muted" style={{ marginBottom: 0 }}>Best days across competitors: <b className="strong">{cmp.commonBestDays.map((x) => x.day).join(", ")}</b></p>}
        </Card>
        <Card title="What they write in captions" sub="Real caption stats per account.">
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Account</th><th>Avg length</th><th>Hashtags / post</th><th>Questions</th><th>Call to action</th><th>Emoji</th></tr></thead>
              <tbody>{accounts.map((x) => (
                <tr key={(x.you ? "me:" : "") + x.profile.username}><td><b>@{x.profile.username}</b>{x.you && " (you)"}</td><td className="num">{x.captions?.avgLength ?? "—"}</td><td className="num">{x.captions?.avgHashtags ?? "—"}</td>
                  <td className="num">{pct(x.captions?.withQuestion)}</td><td className="num">{pct(x.captions?.withCallToAction)}</td><td className="num">{pct(x.captions?.withEmoji)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {a?.captionInsights?.length > 0 && (
            <ul className="small" style={{ paddingLeft: 18, margin: "10px 0 0", lineHeight: 1.7 }}>{a.captionInsights.map((c) => <li key={c}>{c}</li>)}</ul>
          )}
        </Card>
      </div>

      {/* per competitor */}
      {a?.competitorInsights?.length > 0 && (
        <Card className="mt" title={<>Each competitor <Pill tone="violet" icon="sparkles">AI</Pill></>}>
          <div className="sa-grid g-2">
            {a.competitorInsights.map((c) => {
              const acc = (d.accounts || []).find((x) => x.profile.username === c.username);
              return (
                <div key={c.username} style={{ border: "1px solid var(--sa-border)", borderRadius: 16, padding: 14 }}>
                  <b>@{c.username}</b> {acc && <span className="small muted">· {fmt(acc.profile.followers)} followers · {pct(acc.engagementRate)} eng.</span>}
                  {acc?.profile.biography && <p className="small faint" style={{ margin: "6px 0" }}>Bio: {acc.profile.biography}</p>}
                  <div className="small mt-s"><b className="green">Strengths</b><ul style={{ paddingLeft: 18, margin: "4px 0" }}>{c.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
                  <div className="small"><b className="red">Weaknesses</b><ul style={{ paddingLeft: 18, margin: "4px 0" }}>{c.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* top posts */}
      {cmp.topPosts?.length > 0 && (
        <Card className="mt" title="Their best posts" sub="Highest likes + comments in the analyzed posts.">
          <div className="sa-igposts">{cmp.topPosts.map((p) => <IgPostCard key={p.id} post={p} platformName={PLATFORM_META[report.platform]?.label || "Instagram"} />)}</div>
        </Card>
      )}

      {d.notes?.length > 0 && <ul className="small faint mt" style={{ paddingLeft: 18 }}>{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="row mt" style={{ justifyContent: "flex-end" }}><Btn variant="primary" iconRight="arrowRight" onClick={onNext}>Next: approve & create</Btn></div>
    </div>
  );
}
