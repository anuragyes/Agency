import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { AreaChart, Donut } from "../ui/charts";
import { Banner, Btn, Card, DemoTag, Pill, Segmented, StatCard, Thumb, timeAgo } from "../ui/kit";
import { useWorkspace } from "../store";
import { useAuth } from "../context/AuthContext";
import { DASH } from "../mock";
import { editorPath } from "../postUtils";

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const [range, setRange] = useState("7d");
  const { posts, current, online, research } = useWorkspace();
  const { user } = useAuth();
  const firstName = user?.name ? user.name.split(" ")[0] : "there";
  const navigate = useNavigate();
  const r = DASH.ranges[range];

  const real = useMemo(() => posts.data || [], [posts.data]);
  const drafts = real.filter((p) => p.status === "draft");
  const published = real.filter((p) => p.status === "published");
  const upNext = useMemo(
    () =>
      real.filter((p) => p.status !== "published").slice(0, 4).map((p) => {
        const d = new Date(p.updatedAt);
        return {
          id: p._id,
          platform: p.platform || "instagram",
          m: d.toLocaleString("en", { month: "short" }).toUpperCase(),
          d: d.getDate(),
          title: p.content?.title || p.content?.hook || "Untitled post",
          ch: p.platform || "instagram",
          meta: `${p.contentType} · ${p.status === "draft" ? "Needs approval" : p.status}`,
        };
      }),
    [real]
  );
  const rank = research.data?.aggregate?.platformRanking || [];

  return (
    <>
      <div className="sa-page-head">
        <div>
          <h1>{greet()}, {firstName}</h1>
          <p>Here's how {current?.aiProfile?.name || "your brands"} {current ? "is" : "are"} growing across 7 channels this week.</p>
        </div>
        <div className="sa-page-actions">
          <Segmented value={range} onChange={setRange}
            options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "quarter", label: "Quarter" }]} />
          {/* <Btn icon="download" onClick={() => window.print()}>Export</Btn> */}
          <Btn variant="grad" icon="sparkles" to="/app/studio">Create with AI</Btn>
        </div>
      </div>

      <Banner icon="bot"
        title={real.length ? `You have ${real.length} AI post${real.length > 1 ? "s" : ""} · ${published.length} published` : "Autopilot published 18 posts and replied to 214 comments this week"}
        actions={<>
          <span className="sa-platform-stack"><PlatformIcon platform="instagram" size={30} /><PlatformIcon platform="linkedin" size={30} /><PlatformIcon platform="x" size={30} /></span>
          <Btn size="sm" to="/app/pipeline">View log</Btn>
          <Btn size="sm" variant="primary" to="/app/pipeline">Review {drafts.length || 3} draft{(drafts.length || 3) === 1 ? "" : "s"}</Btn>
        </>}>
        {real.length ? `${drafts.length} draft${drafts.length === 1 ? " is" : "s are"} waiting for your approval · last update ${timeAgo(real[0]?.updatedAt)}` : "3 drafts are waiting for your approval · Next post goes live on LinkedIn at 10:30 AM"}
      </Banner>

      <div className="sa-grid g-4 mt">
        {DASH.kpis.map((k) => (
          <StatCard key={k.label} icon={k.icon} iconTone={k.tone} label={k.label} value={k.value} delta={k.delta} deltaLabel="vs last week" spark={k.spark} sparkColor={k.color} />
        ))}
      </div>

      <div className="sa-grid g-main mt">
        <Card title={<>Growth overview <DemoTag /></>} sub="Followers vs. reach, all channels"
          action={<div className="sa-legend"><span><i style={{ background: "#5b4cf6" }} />Reach</span><span><i style={{ background: "#d946ef" }} />Engagement</span></div>}>
          <AreaChart labels={r.labels}
            series={[{ name: "Reach", color: "#5b4cf6", data: r.reach }, { name: "Engagement", color: "#d946ef", data: r.eng }]} height={300} />
        </Card>
        <Card title="AI insights" action={<Pill icon="sparkles">{rank.length ? "From research" : "4 new"}</Pill>}>
          {rank.length > 0 && (
            <Link to="/app/research" className="sa-insight">
              <span className="sa-ic tone-grad"><Icon name="globe" size={18} /></span>
              <div><b>Focus on {rank.slice(0, 2).map((p) => p.platform).join(" + ")}</b><p>Best platform fit from your latest market research ({rank[0].score}/100)</p></div>
            </Link>
          )}
          {DASH.insights.slice(0, rank.length ? 3 : 4).map((i) => (
            <Link to={i.to} key={i.title} className="sa-insight">
              <span className={`sa-ic tone-${i.tone}`}><Icon name={i.icon} size={18} /></span>
              <div><b>{i.title}</b><p>{i.sub}</p></div>
            </Link>
          ))}
        </Card>
      </div>

      <div className="sa-grid g-3b mt">
        <Card title="Top performing posts" action={<Link className="sa-link" to="/app/analyst">See all</Link>}>
          <div className="sa-table-wrap">
            <table className="sa-table" style={{ minWidth: 420 }}>
              <thead><tr><th>Post</th><th>Ch.</th><th>Reach</th><th>Eng.</th><th>Score</th></tr></thead>
              <tbody>
                {DASH.topPosts.map((p) => (
                  <tr key={p.title} onClick={() => navigate("/app/analyst")} style={{ cursor: "pointer" }}>
                    <td><div className="row"><Thumb seed={p.title} size={44} /><div><b className="strong" style={{ fontSize: 14, whiteSpace: "nowrap" }}>{p.title}</b><div className="small muted">{p.type} · {p.date}</div></div></div></td>
                    <td><PlatformIcon platform={p.ch} size={28} /></td>
                    <td className="num">{p.reach}</td>
                    <td>{p.eng}</td>
                    <td><Pill tone={p.score > 90 ? "green" : "violet"}>{p.score}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Audience by channel">
          <div style={{ display: "grid", placeItems: "center" }}>
            <Donut items={DASH.audience} size={210} thickness={28} center="248K" sub="followers" />
          </div>
          <div className="sa-list mt">
            {DASH.audience.map((a) => (
              <div key={a.label} className="row between" style={{ padding: "8px 0" }}>
                <span className="row"><i style={{ width: 9, height: 9, borderRadius: 9, background: a.color }} />{a.label}</span><b className="strong">{a.value}%</b>
              </div>
            ))}
          </div>
        </Card>
        <Card title={<>Up next {!upNext.length && <DemoTag />}</>} action={<Link className="sa-link" to="/app/calendar">Calendar</Link>}>
          <div className="sa-list">
            {(upNext.length ? upNext : DASH.upNext).map((u, i) => (
              <Link key={i} to={u.id ? editorPath(u) : "/app/calendar"} className="sa-li">
                <span style={{ width: 54, textAlign: "center", borderRadius: 12, padding: "6px 0", background: u.accent ? "var(--sa-primary-50)" : "#f6f6fa", color: u.accent ? "var(--sa-primary)" : "var(--sa-muted)" }}>
                  <small style={{ fontWeight: 600, display: "block" }}>{u.m}</small><b style={{ fontSize: 20, color: "inherit" }}>{u.d}</b>
                </span>
                <span className="grow"><b className="ellipsis">{u.title}</b><small className="row" style={{ gap: 6 }}><PlatformIcon platform={u.ch} size={16} /> {u.meta}</small></span>
              </Link>
            ))}
          </div>
          {online && !real.length && <p className="small muted mt-s">No AI posts yet — <Link className="sa-link" to="/app/studio">create your first one</Link>.</p>}
        </Card>
      </div>
    </>
  );
}
