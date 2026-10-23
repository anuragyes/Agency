// Lead generation — demo (CRM / lead capture backend not built yet). CSV export works locally.
import { useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import { ScoreRing } from "../ui/charts";
import { Avatar, Btn, Card, DemoTag, PageHeader, Pill, Segmented, StatCard, gradientFor, useToast } from "../ui/kit";
import { LEADS } from "../mock";

const FUNNEL = [["Reach", "1.2M", "", 100, "#5b4cf6"], ["Engaged", "57.6K", "4.8%", 93, "#6d5cf7"], ["Profile & link visits", "9,420", "16.3%", 86, "#8b5cf6"], ["Leads captured", "1,248", "13.2%", 79, "#a855f7"], ["Qualified", "312", "25%", 72, "#c026d3"], ["Customers", "41", "13.1%", 65, "#db2777"]];

export default function Leads() {
  const toast = useToast();
  const [temp, setTemp] = useState("all");
  const rows = LEADS.filter((l) => temp === "all" || l.temp === temp);

  const exportCsv = () => {
    const head = ["Name", "Role", "Company", "Source", "AI score", "Intent signal", "Status"];
    const csv = [head, ...LEADS.map((l) => [l.name, l.role, l.company, l.source, l.score, l.signal, l.status[1]])].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "sociva-leads.csv";
    a.click();
    toast("Leads exported", "success");
  };

  return (
    <>
      <PageHeader title={<>Lead generation <DemoTag /></>} sub="Every lead captured from comments, DMs and link clicks — scored by AI and synced to your CRM.">
        <Btn icon="refresh">CRM synced · 2m ago</Btn>
        <Btn variant="primary" icon="download" onClick={exportCsv}>Export leads</Btn>
      </PageHeader>
      <div className="sa-grid g-4">
        <StatCard icon="magnet" iconTone="amber" label="New leads" value="1,248" delta="32.4%" />
        <StatCard icon="flame" iconTone="red" label="Hot leads (score 70+)" value="312" delta="18.0%" />
        <StatCard icon="calendar" iconTone="green" label="Demos booked" value="58" delta="24.1%" />
        <StatCard icon="dollar" iconTone="violet" label="Pipeline value" value="$184K" delta="41.7%" />
      </div>

      <div className="sa-grid g-3w mt">
        <Card title="Social-to-revenue funnel" action={<span className="small muted">Last 30 days</span>}>
          <div className="sa-funnel">
            {FUNNEL.map(([l, v, p, w, c]) => <div key={l} style={{ width: `${w}%`, background: c }}><span>{l}</span><span>{v}{p && ` · ${p}`}</span></div>)}
          </div>
        </Card>
        <Card title="Attribution by channel">
          {[["instagram", "Instagram", 32], ["linkedin", "LinkedIn", 28], ["facebook", "Facebook", 16], ["x", "X", 12], ["youtube", "YouTube", 8], ["tiktok", "TikTok", 4]].map(([k, n, v]) => (
            <div key={k} className="row" style={{ padding: "10px 0" }}><PlatformIcon platform={k} size={30} /><span style={{ width: 90 }}>{n}</span><div className="grow sa-meter" style={{ height: 7 }}><span style={{ width: `${v * 3}%`, background: "var(--sa-primary)" }} /></div><b className="strong" style={{ width: 40, textAlign: "right" }}>{v}%</b></div>
          ))}
        </Card>
        <Card title="Top lead sources">
          <div className="sa-list">
            {[["5 AI tools carousel", 184], ["B2B growth case study", 142], ["AI playbook webinar", 121]].map(([t, n]) => (
              <div key={t} className="sa-li"><span className="sa-thumb" style={{ width: 46, height: 46, borderRadius: 13, background: gradientFor(t) }} /><span className="grow"><b>{t}</b><small>{n} leads</small></span></div>
            ))}
            <div className="sa-li"><span className="sa-ic lg tone-violet"><Icon name="bot" size={20} /></span><span className="grow"><b>Comment-to-demo DM</b><small>312 leads</small></span></div>
          </div>
        </Card>
      </div>

      <Card className="mt" title="Recent leads" action={<Segmented value={temp} onChange={setTemp} options={[{ value: "all", label: "All" }, { value: "hot", label: "Hot" }, { value: "warm", label: "Warm" }, { value: "cold", label: "Cold" }]} />}>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>Lead</th><th>Company</th><th>Source</th><th>AI score</th><th>Intent signal</th><th>Status</th><th>CRM</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.name}>
                  <td><div className="row"><Avatar name={l.name} size={40} /><div><b className="strong">{l.name}</b><div className="small muted">{l.role}</div></div></div></td>
                  <td>{l.company}</td>
                  <td><span className="row"><PlatformIcon platform={l.ch} size={22} />{l.source}</span></td>
                  <td><ScoreRing value={l.score} size={46} stroke={4} /></td>
                  <td className="muted">{l.signal}</td>
                  <td><Pill tone={l.status[0]}>{l.status[1]}</Pill></td>
                  <td><Icon name="checkCircle" className="green" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
