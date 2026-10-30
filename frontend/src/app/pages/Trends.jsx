// Trend intelligence — project-specific Google Trends + live Instagram / audience signals
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { AreaChart, Heatmap, Sparkline } from "../ui/charts";
import { Btn, Card, LiveTag, PageHeader, Pill, Segmented, Spinner, cx, useToast } from "../ui/kit";
import { collect, useWorkspace } from "../store";
import { exploreHashtags, getInstagramAudience, getProjectTrends } from "../api";

export default function Trends() {
  const [tab, setTab] = useState("topics");
  const [ch, setCh] = useState("all");
  const [sel, setSel] = useState(0);
  const [trendData, setTrendData] = useState(null);
  const [trendsBusy, setTrendsBusy] = useState(false);
  const [trendsError, setTrendsError] = useState("");
  const [hashtagData, setHashtagData] = useState(null);
  const [hashtagBusy, setHashtagBusy] = useState(false);
  const [hashtagError, setHashtagError] = useState("");
  const [audience, setAudience] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { research, current, profile } = useWorkspace();

  const liveTrends = collect(research.data, (p) => p.marketOverview?.trends).slice(0, 8);
  const liveThemes = collect(research.data, (p) => p.contentInsights?.contentThemes).slice(0, 10);
  const seedTerms = useMemo(() => {
    const product = current?.aiProfile || profile || {};
    const candidates = [
      ...(product.keywords || []).slice(0, 2),
      ...collect(research.data, (p) => p.marketOverview?.trends).slice(0, 1).map((x) => x.value),
      ...collect(research.data, (p) => p.contentInsights?.keywords).slice(0, 1).map((x) => x.value),
      ...collect(research.data, (p) => p.contentInsights?.contentThemes).slice(0, 1).map((x) => x.value),
      ...(product.keywords || []).slice(2, 4),
      product.category,
      ...(product.uses || []).slice(0, 1),
      ...(product.targetAudience || []).slice(0, 1),
      product.name || current?.name,
      ...collect(research.data, (p) => p.marketOverview?.trends).slice(1, 3).map((x) => x.value),
      product.description?.trim().split(/\s+/).length <= 8 ? product.description : "",
    ];
    return [...new Set(candidates.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 5);
  }, [current, profile, research.data]);
  useEffect(() => { getInstagramAudience().then((r) => setAudience(r.data)).catch(() => setAudience(null)); }, [current?._id]);
  const explore = async () => {
    if (!seedTerms.length) { setHashtagError("Add product keywords or run market research for this project first."); return; }
    setHashtagBusy(true); setHashtagError("");
    try { setHashtagData(await exploreHashtags("instagram", seedTerms)); }
    catch (e) { setHashtagError(e.message || "Couldn't load live hashtag data."); }
    finally { setHashtagBusy(false); }
  };
  const loadTrends = async () => {
    if (!seedTerms.length) { setTrendsError("Add product information or run market research for this project first."); return; }
    setTrendsBusy(true); setTrendsError("");
    try { const result = await getProjectTrends({ terms: seedTerms }); setTrendData(result); setSel(0); }
    catch (e) { setTrendsError(e.message || "Google Trends couldn't be reached."); }
    finally { setTrendsBusy(false); }
  };
  useEffect(() => {
    if (!seedTerms.length) return;
    let active = true;
    setTrendsBusy(true);
    setTrendsError("");
    setTrendData(null);
    getProjectTrends({ terms: seedTerms })
      .then((result) => { if (active) { setTrendData(result); setSel(0); } })
      .catch((e) => { if (active) setTrendsError(e.message || "Google Trends couldn't be reached."); })
      .finally(() => { if (active) setTrendsBusy(false); });
    return () => { active = false; };
  }, [current?._id, seedTerms.join("|")]);
  useEffect(() => {
    setHashtagData(null);
    setHashtagError("");
  }, [current?._id, seedTerms.join("|")]);
  const create = (name) => navigate(`/app/studio`, { state: { prompt: name } });

  const trendRows = trendData?.terms || [];
  const t = trendRows[sel] || trendRows[0];

  const online = audience?.online || [];
  const onlineGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const HOUR_MS = 60 * 60 * 1000;
  online.forEach((row) => {
    const end = new Date(String(row.endTime || "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2")).getTime();
    if (!Number.isFinite(end)) return;
    const start = end - 24 * HOUR_MS;
    Object.entries(row.hours || {}).forEach(([h, n]) => {
      const d = new Date(start + Number(h) * HOUR_MS);
      onlineGrid[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 3)] += Number(n) || 0;
    });
  });
  const maxHour = Math.max(0, ...onlineGrid.flat());
  const hourBins = [[6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];
  const heatRows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, day) => ({ label, values: hourBins.map(([a]) => maxHour ? onlineGrid[day][a / 3] / maxHour : 0) }));
  const peak = heatRows.flatMap((r, ri) => r.values.map((v, ci) => ({ v, ri, ci }))).sort((a, b) => b.v - a.v)[0];

  return (
    <>
      <PageHeader title="Trend intelligence" sub={<>Live signals for <b className="strong">{current?.name || "your selected project"}</b>.</>}>
        <Btn icon="refresh" loading={trendsBusy} onClick={loadTrends}>Refresh Google Trends</Btn>
        <Btn icon="bell" onClick={() => toast("Alert created — we'll ping you when a trend breaks out", "success")}>Create alert</Btn>
      </PageHeader>

      <div className="row between wrap" style={{ marginBottom: 22 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: "topics", label: "Topics", icon: "flame" }, { value: "hashtags", label: "Hashtags", icon: "hash" }, { value: "audio", label: "Audio", icon: "music" }, { value: "formats", label: "Formats", icon: "template" }, { value: "news", label: "News", icon: "newspaper" }]} />
        <div className="row wrap">
          {[["all", "All channels"], ["tiktok", "TikTok"], ["linkedin", "LinkedIn"], ["x", "X"]].map(([k, l]) => (
            <button key={k} type="button" className={cx("sa-chip", ch === k && "on")} onClick={() => setCh(k)}>{k !== "all" && <PlatformIcon platform={k} size={20} />}{l}</button>
          ))}
        </div>
      </div>

      {tab === "hashtags" && <Card title={<>Live Instagram hashtags <LiveTag /></>} sub={`Search seeds from ${current?.name || "your project"}: ${seedTerms.join(", ") || "none yet"}`} action={<Btn icon="search" loading={hashtagBusy} onClick={explore}>Explore live hashtags</Btn>}>
        {hashtagError && <p className="small red">{hashtagError}</p>}
        {hashtagBusy ? <div className="row" style={{ padding: 20, gap: 10 }}><Spinner /> Fetching real Instagram hashtag results…</div> : hashtagData?.hashtags?.length ? <div className="sa-grid g-2">{hashtagData.hashtags.map((h) => <div key={h.hashtag} className="row" style={{ border: "1px solid var(--sa-border)", borderRadius: 12, padding: 12 }}><b className="strong grow">{h.hashtag}</b><span className="small muted">{h.posts} posts · score {h.score}</span><Btn size="sm" icon="sparkles" onClick={() => create(h.hashtag)}>Create</Btn></div>)}</div> : <p className="muted small">Run Explore to load current hashtags and post signals from Instagram. Results are project-specific.</p>}
      </Card>}

      {liveTrends.length > 0 && (
        <Card style={{ marginBottom: 22 }} title={<>From your market research <LiveTag /></>} sub="Trends the research agents found for your product">
          <div className="sa-grid g-2" style={{ gap: 10 }}>
            {liveTrends.map(({ value, platform }, i) => (
              <div key={i} className="row" style={{ border: "1px solid var(--sa-border)", borderRadius: 14, padding: "10px 14px" }}>
                <PlatformIcon platform={platform} size={24} /><span className="grow small">{value}</span>
                <Btn size="sm" icon="sparkles" onClick={() => create(value)}>Create</Btn>
              </div>
            ))}
          </div>
          {liveThemes.length > 0 && <div className="sa-chipset mt">{liveThemes.map(({ value }) => <Pill key={value} tone="violet">{value}</Pill>)}</div>}
        </Card>
      )}

      <div className="sa-grid g-main-r">
        <Card title={<>Trending topics {trendRows.length ? <LiveTag /> : null}</>} sub={trendRows.length ? `Google search interest · ${trendData.geo}` : "Search interest for topics from your selected project"}>
          {trendsError && <p className="small red">{trendsError}</p>}
          {trendsBusy && <div className="row" style={{ padding: 16, gap: 10 }}><Spinner /> Fetching project-specific search interest…</div>}
          {!trendsBusy && !trendRows.length && <div className="small muted" style={{ padding: 16 }}>No Google Trends results yet. This project’s research and keywords will be used to find relevant topics.</div>}
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>#</th><th>Search topic</th><th>Interest (12 mo)</th><th>Current index</th><th>4-week change</th><th /></tr></thead>
              <tbody>
                {trendRows.map((r, i) => (
                  <tr key={r.name} className={cx(i === sel && "hl")} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
                    <td className="muted">{i + 1}</td>
                    <td><b className="strong">{r.name}</b><div className="small muted">{r.cat}</div></td>
                    <td><Sparkline data={r.spark} color={(r.growth ?? 0) < 0 ? "#ef4444" : "#5b4cf6"} width={130} height={38} /></td>
                    <td className="num">{r.interest}</td>
                    <td className={r.growth == null ? "muted" : r.growth < 0 ? "red strong" : "green strong"} style={{ whiteSpace: "nowrap" }}>{r.growth == null ? "Not enough history" : `${r.growth > 0 ? "↗ +" : ""}${r.growth}%`}</td>
                    <td><Btn size="sm" icon="sparkles" onClick={(e) => { e.stopPropagation(); create(r.name); }}>Create</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {t && <div className="sa-card" style={{ border: "1.5px solid #c9bffc" }}>
            <div className="row between"><Pill tone={t.growth > 0 ? "green" : "gray"} icon="trend">{t.growth == null ? "Tracking" : t.growth > 25 ? "Rising" : t.growth < -10 ? "Cooling" : "Steady"}</Pill><span className="small muted">Google Trends · {trendData.geo}</span></div>
            <h2 style={{ fontSize: 24, marginTop: 14 }}>{t.name}</h2>
            <p className="muted" style={{ margin: "4px 0 10px" }}>Search interest index {t.interest}/100{t.growth != null ? ` · ${t.growth > 0 ? "+" : ""}${t.growth}% over the last four weeks` : ""}</p>
            <AreaChart height={200} labels={t.points.map((p) => new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}
              series={[{ name: "Search interest", color: "#5b4cf6", data: t.points.map((p) => p.value) }]} />
            <div className="small muted mt">Google scales each topic’s search interest from 0 to 100 for the selected time and region. It does not report absolute search volume.</div>
            <hr className="sa-hr" style={{ margin: "16px 0" }} />
            <b className="strong">Content opportunities</b>
            {[["linkedin", `"We replaced 3 tools with 1 AI agent"`, "Story post · est. 45K reach"], ["tiktok", "Day in the life with an AI marketer", "Reel · trending audio attached"], ["x", "Thread: 7 agent workflows to copy", "Thread · high save potential"]].map(([c, a, b]) => (
              <button key={a} type="button" className="row mt-s" style={{ width: "100%", textAlign: "left", background: "#f8f8fb", borderRadius: 14, padding: 12 }} onClick={() => create(a)}>
                <PlatformIcon platform={c} size={30} /><span className="grow"><b className="strong" style={{ fontSize: 14 }}>{a}</b><div className="small muted">{b}</div></span><Icon name="sparkles" size={18} style={{ color: "var(--sa-primary)" }} />
              </button>
            ))}
            <Btn variant="grad" className="sa-btn-block mt" icon="sparkles" onClick={() => create(t.name)}>Create content from this topic</Btn>
          </div>}
          <Card title={<>Best time to ride it {online.length ? <LiveTag /> : <Pill tone="gray">Unavailable</Pill>}</>} sub={online.length ? "Based on your Instagram followers’ real online activity" : "Connect Instagram and enable audience insights to see live activity"}>
            <Heatmap cols={["6a", "9a", "12p", "3p", "6p", "9p"]} rows={online.length ? heatRows : []} highlight={peak?.v ? [peak.ri, peak.ci] : undefined} />
            {!online.length && <p className="small muted">No live online-time data is available for this Instagram account yet.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
