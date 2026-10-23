// Analytics & reports — demo analytics + LIVE "your Sociva activity" from real posts
import { useMemo, useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import { AreaChart, BarChart, Sparkline } from "../ui/charts";
import { Btn, Card, DemoTag, Modal, PageHeader, Pill, Segmented, Toggle, useToast } from "../ui/kit";
import { useWorkspace } from "../store";
import { CHANNEL_PERF, SPARK } from "../mock";

const KPIS = [["Impressions", "3.8M", "+21.4%", SPARK.up], ["Reach", "1.2M", "+18.1%", SPARK.up2], ["Engagements", "57.6K", "+26.0%", SPARK.up], ["Eng. rate", "4.8%", "+0.6", SPARK.wavy], ["Link clicks", "9,420", "+33.2%", SPARK.up2], ["Unfollows", "1,102", "+4.2%", SPARK.spiky, true]];
const DAYS = Array.from({ length: 26 }, (_, i) => `Sep ${i + 1}`);
const gen = (base, g, amp, s) => DAYS.map((_, i) => Math.round(base + g * i + amp * Math.sin(i * 0.8 + s) + amp * 0.4 * Math.sin(i * 1.9)));
const METRICS = {
  reach: { cur: gen(26000, 3000, 4000, 1), prev: gen(22000, 1300, 1500, 2) },
  engagement: { cur: gen(1200, 120, 200, 2), prev: gen(1000, 60, 100, 3) },
  followers: { cur: gen(300, 30, 60, 3), prev: gen(260, 15, 30, 1) },
  clicks: { cur: gen(200, 18, 40, 4), prev: gen(170, 9, 20, 2) },
  leads: { cur: gen(20, 2.4, 6, 5), prev: gen(16, 1, 3, 4) },
};

export default function Analytics() {
  const toast = useToast();
  const { posts, current } = useWorkspace();
  const [metric, setMetric] = useState("reach");
  const [reports, setReports] = useState([
    { icon: "file", tone: "violet", t: "Monthly client report", s: "Acme Co · 1st of month · PDF", on: true },
    { icon: "mail", tone: "blue", t: "Weekly team digest", s: "Mondays 9 AM · Email", on: true },
    { icon: "chart", tone: "green", t: "Quarterly business review", s: "Every 3 months · Slides", on: false },
    { icon: "link", tone: "amber", t: "Live client dashboard", s: "White-label link · 3 clients", on: true },
  ]);
  const [gen2, setGen2] = useState(false);
  const m = METRICS[metric];
  const real = useMemo(() => posts.data || [], [posts.data]);
  const byType = useMemo(() => ["image", "carousel", "reel"].map((t) => ({ label: t[0].toUpperCase() + t.slice(1), values: [real.filter((p) => p.contentType === t).length, real.filter((p) => p.contentType === t && p.status === "published").length] })), [real]);

  return (
    <>
      <PageHeader title="Analytics & reports" sub="Performance across all channels · Sep 1 – Sep 26, 2026 compared to previous period">
        <Btn icon="calendar">Month to date</Btn>
        <Btn icon="share" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast("Link copied", "success"); }}>Share</Btn>
        <Btn variant="primary" icon="file" onClick={() => setGen2(true)}>Generate report</Btn>
      </PageHeader>

      <div className="sa-banner">
        <span className="sa-banner-ic"><Icon name="sparkles" size={22} /></span>
        <div className="sa-banner-body"><h4>AI summary</h4><p>September is your strongest month yet: reach grew <b>18%</b> driven by Instagram carousels and TikTok BTS content. LinkedIn delivered <b>42% of qualified leads</b> from just 16% of posts. X engagement is declining — consider shifting 3 weekly posts to Threads.</p></div>
        <Btn size="sm">Ask a question</Btn>
      </div>

      <div className="sa-grid g-6 mt">
        {KPIS.map(([l, v, d, s, bad]) => (
          <div key={l} className="sa-card sa-mini"><div className="label">{l}</div><div className="value">{v}</div><div className="bottom"><b className={bad ? "red small" : "green small"}>{d}</b><Sparkline data={s} color={bad ? "#ef4444" : "#5b4cf6"} width={90} height={30} /></div></div>
        ))}
      </div>

      <div className="sa-grid g-main mt">
        <Card>
          <div className="row between wrap" style={{ marginBottom: 16 }}>
            <Segmented value={metric} onChange={setMetric} options={["reach", "engagement", "followers", "clicks", "leads"].map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} />
            <div className="sa-legend"><DemoTag /><span><i style={{ background: "#5b4cf6" }} />This period</span><span><i style={{ background: "#c5c7d4" }} />Previous</span></div>
          </div>
          <AreaChart height={320} labels={DAYS} series={[{ name: "This period", color: "#5b4cf6", data: m.cur }, { name: "Previous", color: "#c5c7d4", data: m.prev, dashed: true }]} />
        </Card>
        <Card title={real.length ? "Your AI posts by format" : "Posts by format"} sub={real.length ? `${real.length} posts${current ? ` for ${current.aiProfile?.name}` : ""}` : undefined}
          action={<div className="sa-legend"><span><i style={{ background: "#5b4cf6" }} />{real.length ? "Created" : "Reach"}</span><span><i style={{ background: "#f0abfc" }} />{real.length ? "Published" : "Engagement"}</span></div>}>
          <BarChart height={300} colors={["#5b4cf6", "#f0abfc"]} names={real.length ? ["Created", "Published"] : ["Reach", "Engagement"]}
            groups={real.length ? byType : [{ label: "Carousel", values: [92, 86] }, { label: "Video", values: [70, 74] }, { label: "Text", values: [44, 58] }, { label: "Image", values: [30, 40] }, { label: "Poll", values: [16, 34] }]} />
        </Card>
      </div>

      <div className="sa-grid g-main mt">
        <Card title="Channel performance">
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Channel</th><th>Posts</th><th>Reach</th><th>Eng. rate</th><th>Followers</th><th>Clicks</th><th>Leads</th><th>Trend</th></tr></thead>
              <tbody>
                {CHANNEL_PERF.map((c) => (
                  <tr key={c.ch}>
                    <td><span className="row"><PlatformIcon platform={c.ch} size={30} /><b className="strong">{c.name}</b></span></td>
                    <td>{c.posts}</td><td className="num">{c.reach}</td><td>{c.eng}</td><td className="green strong">{c.followers}</td><td>{c.clicks}</td><td className="num">{c.leads}</td>
                    <td><Sparkline data={c.spark} color={c.down ? "#ef4444" : "#10b981"} width={110} height={30} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Scheduled reports" action={<button type="button" className="sa-link" aria-label="Add report" onClick={() => setGen2(true)}><Icon name="plus" size={20} /></button>}>
          <div className="sa-list">
            {reports.map((r, i) => (
              <div key={r.t} className="sa-li"><span className={`sa-ic lg tone-${r.tone}`}><Icon name={r.icon} size={20} /></span><span className="grow"><b>{r.t}</b><small>{r.s}</small></span>
                <Toggle checked={r.on} onChange={(v) => setReports((l) => l.map((x, j) => (j === i ? { ...x, on: v } : x)))} label={r.t} /></div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={gen2} onClose={() => setGen2(false)} title="Generate report" footer={<><Btn onClick={() => setGen2(false)}>Cancel</Btn><Btn variant="primary" icon="download" onClick={() => { setGen2(false); setTimeout(() => window.print(), 100); }}>Download PDF</Btn></>}>
        <p className="muted" style={{ marginTop: 0 }}>Builds a branded PDF of this page — channels, KPIs and the AI summary. White-label + scheduling arrive with the reporting API.</p>
        <div className="sa-chipset">{["Executive summary", "KPIs", "Channel table", "Top posts", "Recommendations"].map((x) => <Pill key={x} tone="violet" icon="check">{x}</Pill>)}</div>
      </Modal>
    </>
  );
}
