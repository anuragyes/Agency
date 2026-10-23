// Trend intelligence — demo trend feed + LIVE signals from the latest market research (if any)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { AreaChart, Heatmap, Sparkline } from "../ui/charts";
import { Btn, Card, DemoTag, LiveTag, PageHeader, Pill, Segmented, cx, useToast } from "../ui/kit";
import { TRENDS, HEAT } from "../mock";
import { collect, useWorkspace } from "../store";

const FORECAST = { actual: [8, 10, 12, 15, 22, 36, 58, 88, 120], forecast: [null, null, null, null, null, null, null, null, 120, 146, 158, 150, 138] };

export default function Trends() {
  const [tab, setTab] = useState("topics");
  const [ch, setCh] = useState("all");
  const [sel, setSel] = useState(0);
  const [tracked, setTracked] = useState([]);
  const navigate = useNavigate();
  const toast = useToast();
  const { research } = useWorkspace();
  const t = TRENDS[sel];

  const liveTrends = collect(research.data, (p) => p.marketOverview?.trends).slice(0, 8);
  const liveThemes = collect(research.data, (p) => p.contentInsights?.contentThemes).slice(0, 10);
  const create = (name) => navigate(`/app/studio`, { state: { prompt: name } });

  const fc = FORECAST.forecast.map((v, i) => v ?? FORECAST.actual[i] ?? 0);

  return (
    <>
      <PageHeader title="Trend intelligence" sub={<>Rising topics in <b className="strong">B2B marketing &amp; SaaS</b>, ranked by relevance to your brand. Updated 4 min ago.</>}>
        <Btn icon="globe">Global</Btn>
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
        <Card title={<>Trending topics <DemoTag /></>}>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>#</th><th>Trend</th><th>Momentum (7d)</th><th>Volume</th><th>Growth</th><th>Brand fit</th><th /></tr></thead>
              <tbody>
                {TRENDS.map((r, i) => (
                  <tr key={r.name} className={cx(i === sel && "hl")} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
                    <td className="muted">{i + 1}</td>
                    <td><b className="strong">{r.name}</b><div className="small muted">{r.cat}</div></td>
                    <td><Sparkline data={r.spark} color={r.growth < 0 ? "#ef4444" : i < 3 ? "#5b4cf6" : "#0ea5e9"} width={130} height={38} /></td>
                    <td className="num">{r.vol}</td>
                    <td className={r.growth < 0 ? "red strong" : "green strong"} style={{ whiteSpace: "nowrap" }}>{r.growth > 0 ? "↗ +" : ""}{r.growth}%</td>
                    <td><div className="row" style={{ minWidth: 130 }}><div className="sa-meter" style={{ height: 7 }}><span style={{ width: `${r.fit}%`, background: r.fit > 85 ? "#10b981" : r.fit > 60 ? "#5b4cf6" : "#9ca3af" }} /></div><b className="strong">{r.fit}</b></div></td>
                    <td>{r.create ? <Btn size="sm" icon="sparkles" onClick={(e) => { e.stopPropagation(); create(r.name); }}>Create</Btn>
                      : <Btn size="sm" variant={tracked.includes(r.name) ? "soft" : "default"} onClick={(e) => { e.stopPropagation(); setTracked((l) => (l.includes(r.name) ? l.filter((x) => x !== r.name) : [...l, r.name])); }}>{tracked.includes(r.name) ? "Tracking" : "Track"}</Btn>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="sa-card" style={{ border: "1.5px solid #c9bffc" }}>
            <div className="row between"><Pill tone="red" icon="flame">{t.growth > 100 ? "Breakout" : t.growth > 0 ? "Rising" : "Cooling"}</Pill><span className="small muted">Peak predicted in ~36h</span></div>
            <h2 style={{ fontSize: 24, marginTop: 14 }}>{t.name}</h2>
            <p className="muted" style={{ margin: "4px 0 10px" }}>{t.vol} mentions · {t.growth > 0 ? "+" : ""}{t.growth}% this week</p>
            <AreaChart height={200} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
              series={[{ name: "AI forecast", color: "#d946ef", data: fc.map((v) => v * (t.fit / 96) * 1000), dashed: true }, { name: "Actual", color: "#5b4cf6", data: FORECAST.actual.map((v) => v * (t.fit / 96) * 1000) }]} />
            <div className="sa-legend"><span><i style={{ background: "#5b4cf6" }} />Actual</span><span><i className="dash" style={{ background: "#d946ef" }} />AI forecast</span></div>
            <hr className="sa-hr" style={{ margin: "16px 0" }} />
            <b className="strong">Content opportunities</b>
            {[["linkedin", `"We replaced 3 tools with 1 AI agent"`, "Story post · est. 45K reach"], ["tiktok", "Day in the life with an AI marketer", "Reel · trending audio attached"], ["x", "Thread: 7 agent workflows to copy", "Thread · high save potential"]].map(([c, a, b]) => (
              <button key={a} type="button" className="row mt-s" style={{ width: "100%", textAlign: "left", background: "#f8f8fb", borderRadius: 14, padding: 12 }} onClick={() => create(a)}>
                <PlatformIcon platform={c} size={30} /><span className="grow"><b className="strong" style={{ fontSize: 14 }}>{a}</b><div className="small muted">{b}</div></span><Icon name="sparkles" size={18} style={{ color: "var(--sa-primary)" }} />
              </button>
            ))}
            <Btn variant="grad" className="sa-btn-block mt" icon="sparkles" onClick={() => create(t.name)}>Create content from this trend</Btn>
          </div>
          <Card title="Best time to ride it">
            <Heatmap cols={["6a", "9a", "12p", "3p", "6p", "9p"]} rows={HEAT.slice(0, 5).map((r) => ({ label: r.label, values: r.values.slice(2) }))} highlight={[3, 4]} />
          </Card>
        </div>
      </div>
    </>
  );
}
