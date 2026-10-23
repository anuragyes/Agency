// ─────────────────────────────────────────────────────────────
// IntelligenceReport.jsx — analytics for one finished pipeline run (report.intelligence)
//   Overview · Posts · Audience · Gaps & opportunities · Strategy · Briefs & QC · Results
// Every number comes from the code agents (real Instagram data). "AI" marks text written by the LLM.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon from "../../ui/Icon";
import { Btn, Card, Empty, Pill, Tabs, cx, fmt, timeAgo } from "../../ui/kit";
import { Donut, ScoreRing } from "../../ui/charts";
import { DayHourHeat, HBarList, ScatterPlot, StackedBars } from "../../ui/intelCharts";
import { FORMAT_COLORS, FORMAT_LABEL } from "../../ui/intelTheme";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "posts", label: "Post insights" },
  { value: "audience", label: "Audience" },
  { value: "gaps", label: "Gaps & opportunities" },
  { value: "strategy", label: "Strategy" },
  { value: "briefs", label: "Briefs & QC" },
  { value: "results", label: "Results" },
];
const TYPE_TONE = { theme: "violet", format: "blue", conversation: "pink", cta: "amber", timing: "gray", hashtag: "blue", audience: "green", frequency: "gray", hook: "pink" };
const PART_LABEL = { impact: "Impact", whitespace: "White space", brandFit: "Brand fit", ease: "Ease", confidence: "Confidence" };
const SENT = [["positive", "var(--sa-green)", "Positive"], ["neutral", "var(--sa-gray-400)", "Neutral"], ["negative", "var(--sa-red)", "Negative"]];
const pi = (v) => (v == null ? "—" : `${v}×`);
const Src = ({ ai }) => (ai ? <Pill tone="violet" icon="sparkles">AI</Pill> : <Pill tone="gray" icon="database">Code</Pill>);

function MiniPost({ p, right }) {
  return (
    <a className="sa-mini-post" href={p.permalink} target="_blank" rel="noreferrer">
      <span className="sa-mini-img">{p.imageUrl ? <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <Icon name={p.format === "reel" ? "video" : p.format === "carousel" ? "carousel" : "image"} size={18} />}</span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="small" style={{ color: "var(--sa-ink)" }}>@{p.username}</b> <span className="small faint">· {FORMAT_LABEL[p.format] || p.format}{p.timestamp ? ` · ${timeAgo(p.timestamp)}` : ""}</span>
        <span className="small ellipsis" style={{ display: "block" }}>{p.hook || "(no caption)"}</span>
        <span className="small muted">{fmt(p.likes)} likes · {fmt(p.comments)} comments</span>
      </span>
      {right}
    </a>
  );
}

export default function IntelligenceReport({ report, onAnalyzeResults, analyzing }) {
  const [tab, setTab] = useState("overview");
  const I = report.intelligence;
  if (!I) return <Card className="mt"><Empty icon="bot" title="No agent analytics for this report">This report was made before the multi-agent pipeline. Run a new research to get the analytics.</Empty></Card>;
  const perf = I.performance || {};
  const posts = I.posts || {};
  const aud = I.audience || {};
  const st = I.strategy || {};
  const ai = report.analysis?.source !== "code" && !!report.analysis;
  const ideas = report.analysis?.contentIdeas || I.ideas || [];
  const qByIdea = new Map((I.quality?.results || []).map((q) => [q.ideaIndex, q]));
  const allAcc = [...(perf.accounts || []), ...(perf.you ? [perf.you] : [])];

  return (
    <div className="mt">
      <Tabs options={TABS.map((t) => ({ ...t, count: t.value === "gaps" ? I.opportunities?.length : t.value === "briefs" ? I.briefs?.length : undefined }))} value={tab} onChange={setTab} />

      {/* ───── overview ───── */}
      {tab === "overview" && (
        <>
          <div className="sa-kpis mt">
            <div className="sa-kpi"><span>Competitors analysed</span><b>{perf.accounts?.length || 0}</b><small>{posts.totals?.posts} posts</small></div>
            <div className="sa-kpi"><span>Median engagement rate</span><b>{perf.medians?.engagementRate ?? "—"}%</b><small>competitors</small></div>
            <div className="sa-kpi"><span>Your engagement rate</span><b>{perf.you?.engagementRate ?? "—"}{perf.you ? "%" : ""}</b><small>{perf.you ? `rank ${perf.you.rank} of ${allAcc.length}` : "not available"}</small></div>
            <div className="sa-kpi"><span>Median posts / week</span><b>{perf.medians?.postsPerWeek ?? "—"}</b><small>you: {perf.you?.postsPerWeek ?? "—"}</small></div>
            <div className="sa-kpi"><span>Top opportunity</span><b style={{ fontSize: 16 }}>{I.opportunities?.[0]?.title || "—"}</b><small>score {I.opportunities?.[0]?.score ?? "—"}/100</small></div>
          </div>
          {st.positioning && (
            <div className="sa-banner tone-violet mt"><span className="sa-banner-ic"><Icon name="target" size={20} /></span>
              <div className="sa-banner-body"><h4>Positioning {st.positioningSource === "ai" ? <Pill tone="violet" icon="sparkles">AI</Pill> : <Pill tone="gray">Code</Pill>}</h4><p>{st.positioning}</p></div></div>
          )}
          <div className="sa-grid g-2 mt">
            <Card title="Performance score" sub="0–100 · engagement rate, momentum, frequency, consistency, conversation (percentile ranks). Pink = you.">
              <HBarList max={100} labelWidth={130}
                rows={[...allAcc].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((a) => ({ key: (a.isYou ? "me:" : "") + a.username, label: `@${a.username}`, value: a.score ?? 0, display: `${a.score ?? "—"}`, sub: a.isYou ? "you" : a.tier, highlight: a.isYou }))} />
            </Card>
            <Card title="Audience size vs engagement" sub="Each dot is an account. Higher = more engagement per follower.">
              <ScatterPlot points={allAcc.map((a) => ({ key: (a.isYou ? "me:" : "") + a.username, label: `@${a.username}`, x: a.followers, y: a.engagementRate, you: a.isYou }))} />
            </Card>
          </div>
          <Card className="mt" title="Competitor performance" sub="Momentum = newer half of posts vs older half. Consistency = how stable results are. Conversation = comments per 100 likes.">
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead><tr><th>#</th><th>Account</th><th>Tier</th><th>Score</th><th>Eng. rate</th><th>Momentum</th><th>Consistency</th><th>Conversation</th><th>Posts/wk</th><th>Viral posts</th></tr></thead>
                <tbody>{[...allAcc].sort((a, b) => (a.rank || 99) - (b.rank || 99)).map((a) => (
                  <tr key={(a.isYou ? "me:" : "") + a.username} style={a.isYou ? { background: "#fdf2fb" } : undefined}>
                    <td className="num">{a.isYou ? "—" : a.rank ?? "—"}</td>
                    <td><b style={{ color: "var(--sa-primary)" }}>@{a.username}</b>{a.isYou && <Pill tone="pink" style={{ marginLeft: 6 }}>you</Pill>}</td>
                    <td>{a.isYou ? "—" : <Pill tone={a.tier === "Leader" ? "green" : a.tier === "Follower" ? "gray" : "blue"}>{a.tier}</Pill>}</td>
                    <td className="num"><b className="strong">{a.score ?? "—"}</b></td>
                    <td className="num">{a.engagementRate ?? "—"}%</td>
                    <td className="num">{a.momentum == null ? "—" : <span className={a.momentum >= 0 ? "green" : "red"}>{a.momentum >= 0 ? "▲" : "▼"} {Math.abs(a.momentum)}%</span>}</td>
                    <td className="num">{a.consistency ?? "—"}</td>
                    <td className="num">{a.conversationRate ?? "—"}</td>
                    <td className="num">{a.postsPerWeek ?? "—"}</td>
                    <td className="num">{a.outliers}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {perf.patterns?.length > 0 && <>
              <div className="sa-section-label mt" style={{ marginBottom: 8 }}>What the leaders do differently</div>
              <div className="sa-kpis">{perf.patterns.map((p) => (
                <div key={p.key} className="sa-kpi"><span>{p.label}</span><b style={{ fontSize: 18 }}>{p.leaders}{p.unit} <small>vs {p.rest}{p.unit}</small></b><small className={p.diff > 0 ? "green" : "red"}>{p.diff > 0 ? "+" : ""}{p.diff}{p.unit} for leaders ({perf.leaders?.map((u) => `@${u}`).join(", ")})</small></div>
              ))}</div>
            </>}
          </Card>
        </>
      )}

      {/* ───── posts ───── */}
      {tab === "posts" && (
        <>
          <div className="sa-grid g-2 mt">
            <Card title="Content themes" sub="Performance index = post ER ÷ that account's typical post (1.0×). Fair across big and small accounts.">
              <HBarList labelWidth={160} format={pi}
                rows={(posts.themes || []).filter((t) => t.reliable).slice(0, 12).map((t) => ({ key: t.key, label: t.key, value: t.performanceIndex ?? 0, display: pi(t.performanceIndex), sub: `${t.share}% · ${t.accounts} accts` }))} />
              <p className="small faint" style={{ marginBottom: 0 }}>Sub-label = share of posts · competitors using it. Themes with fewer than 3 posts are hidden.</p>
            </Card>
            <Card title="Format mix per account" sub="Share of each account's recent posts.">
              <StackedBars labelWidth={130} rows={(posts.formatMix || []).map((r) => ({ label: `@${r.username}`, parts: r.mix }))} />
            </Card>
          </div>
          <div className="sa-grid g-3 mt">
            <Card title="Formats" sub="Performance index">
              <HBarList labelWidth={80} format={pi} rows={(posts.formats || []).map((f) => ({ key: f.key, label: FORMAT_LABEL[f.key] || f.key, value: f.performanceIndex ?? 0, display: pi(f.performanceIndex), sub: `${f.posts}`, color: FORMAT_COLORS[f.key] }))} />
            </Card>
            <Card title="Hook types" sub="First line of the caption">
              <HBarList labelWidth={110} format={pi} rows={(posts.hooks || []).filter((h) => h.reliable).map((h) => ({ key: h.key, label: h.key, value: h.performanceIndex ?? 0, display: pi(h.performanceIndex), sub: `${h.posts}` }))} />
            </Card>
            <Card title="Caption length" sub="Characters, hashtags removed">
              <HBarList labelWidth={120} format={pi} rows={(posts.captionLength || []).filter((h) => h.reliable).map((h) => ({ key: h.key, label: h.key, value: h.performanceIndex ?? 0, display: pi(h.performanceIndex), sub: `${h.posts}` }))} />
            </Card>
          </div>
          <Card className="mt" title="When competitors post — and what works" sub="Day × 3-hour slot. Hover a cell for its performance index.">
            <DayHourHeat heatmap={posts.heatmap} />
          </Card>
          <div className="sa-grid g-2 mt">
            <Card title="Viral outliers" sub={`Posts that did ≥ 2.5× their account's typical post.`}>
              {posts.outliers?.length ? <div className="sa-grid" style={{ gap: 10 }}>{posts.outliers.slice(0, 8).map((p) => <MiniPost key={p.id} p={p} right={<Pill tone="green">{p.multiple}×</Pill>} />)}</div>
                : <p className="small muted">No outliers in this sample.</p>}
            </Card>
            <Card title="Words in the best hooks" sub="Most common words in the first line of the top 20% posts.">
              <div className="sa-chipset">{(posts.topWords || []).map((w) => <Pill key={w.term} tone="outline">{w.term} <b className="strong">{w.count}</b></Pill>)}</div>
              <div className="sa-section-label mt" style={{ marginBottom: 8 }}>Questions & CTAs</div>
              <HBarList labelWidth={120} format={pi} rows={[...(posts.question || []), ...(posts.cta || [])].map((q) => ({ key: q.key, label: q.key, value: q.performanceIndex ?? 0, display: pi(q.performanceIndex), sub: `${q.share}%` }))} />
            </Card>
          </div>
        </>
      )}

      {/* ───── audience ───── */}
      {tab === "audience" && (
        <>
          <div className="sa-grid g-2 mt">
            <Card title="Your audience (comment text)" sub={aud.own?.available ? `${aud.own.total} comments on ${aud.own.postsRead} of your posts` : "Comments on your own posts"}>
              {aud.own?.available ? (
                <div className="row wrap" style={{ gap: 20, alignItems: "center" }}>
                  <Donut size={150} thickness={20} center={`${aud.own.netSentiment > 0 ? "+" : ""}${aud.own.netSentiment}`} sub="net sentiment"
                    items={SENT.map(([k, color]) => ({ label: k, value: aud.own.sentiment[k] || 0, color }))} />
                  <div className="grow">
                    {SENT.map(([k, color, label]) => (
                      <div key={k} className="row between small" style={{ padding: "4px 0" }}><span className="row" style={{ gap: 7 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />{label}</span><b className="strong">{aud.own.sentimentShare[k]}% <span className="faint">({aud.own.sentiment[k]})</span></b></div>
                    ))}
                  </div>
                </div>
              ) : <p className="small muted">{aud.own?.note || "No comments could be read on your posts."}</p>}
              {aud.own?.intents?.length > 0 && <>
                <div className="sa-section-label mt" style={{ marginBottom: 8 }}>What people want</div>
                <HBarList labelWidth={130} format={(v) => `${v}%`} rows={aud.own.intents.map((i) => ({ key: i.intent, label: i.intent, value: i.share, display: `${i.share}%`, sub: `${i.count}` }))} />
              </>}
            </Card>
            <Card title="What your audience asks" sub="Real questions from your comments — answer them with content.">
              {aud.own?.questions?.length ? <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>{aud.own.questions.map((q) => <li key={q}>“{q}”</li>)}</ul> : <p className="small muted">No questions found.</p>}
              {aud.own?.keywords?.length > 0 && <>
                <div className="sa-section-label mt" style={{ marginBottom: 8 }}>Top words</div>
                <div className="sa-chipset">{aud.own.keywords.slice(0, 16).map((w) => <Pill key={w.term} tone="outline">{w.term} <b className="strong">{w.count}</b></Pill>)}</div>
              </>}
            </Card>
          </div>
          <div className="sa-grid g-2 mt">
            <Card title="Competitor conversation rate" sub="Comments per 100 likes — how much each audience talks back.">
              <HBarList labelWidth={130} rows={[...(aud.competitors?.byAccount || []), ...(aud.you ? [{ ...aud.you, username: perf.you?.username || "you", you: true }] : [])]
                .sort((a, b) => (b.commentsPer100Likes ?? -1) - (a.commentsPer100Likes ?? -1))
                .map((a) => ({ key: (a.you ? "me:" : "") + a.username, label: `@${a.username}`, value: a.commentsPer100Likes ?? 0, display: `${a.commentsPer100Likes ?? "—"}`, sub: `${a.avgComments}/post`, highlight: a.you }))} />
              {aud.competitors?.question?.lift != null && (
                <div className="sa-banner tone-violet mt" style={{ padding: 12 }}><Icon name="message" /><div className="small">Captions with a question get <b className="strong">{aud.competitors.question.lift}×</b> the comments per like ({aud.competitors.question.withQuestion.commentsPer100Likes} vs {aud.competitors.question.withoutQuestion.commentsPer100Likes} per 100 likes).</div></div>
              )}
            </Card>
            <Card title="Posts that started the most conversation">
              <div className="sa-grid" style={{ gap: 10 }}>{(aud.competitors?.topConversation || []).map((p) => <MiniPost key={p.id} p={p} right={<Pill tone="violet" icon="message">{fmt(p.comments)}</Pill>} />)}</div>
              <p className="small faint" style={{ marginBottom: 0 }}>{aud.limitations?.[0]}</p>
            </Card>
          </div>
        </>
      )}

      {/* ───── gaps & opportunities ───── */}
      {tab === "gaps" && (
        <>
          <div className="sa-grid g-main-r mt">
            <Card title="Opportunities" sub="Ranked by score = impact × white space × brand fit × ease × confidence (weights in content-opportunity.md).">
              <HBarList max={100} labelWidth={240} rows={(I.opportunities || []).map((o) => ({ key: o.id, label: `${o.rank}. ${o.title}`, value: o.score, display: `${o.score}` }))} />
            </Card>
            <Card title="Gaps by type">
              <HBarList labelWidth={110} rows={Object.entries((I.gaps || []).reduce((m, g) => ({ ...m, [g.type]: (m[g.type] || 0) + 1 }), {})).map(([k, v]) => ({ key: k, label: k, value: v }))} />
              <p className="small faint" style={{ marginBottom: 0 }}>{I.gaps?.length || 0} gaps found by the Content Gap Agent, every one with evidence.</p>
            </Card>
          </div>
          <div className="sa-grid g-2 mt">
            {(I.opportunities || []).map((o) => (
              <div key={o.id} className="sa-opp">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <span><b className="strong">{o.rank}. {o.title}</b><span className="row wrap mt-s" style={{ gap: 6 }}><Pill tone={TYPE_TONE[o.type]}>{o.type}</Pill><Pill tone="outline">{o.pillar}</Pill><Pill tone="outline" style={{ borderColor: FORMAT_COLORS[o.format] }}>{FORMAT_LABEL[o.format] || o.format}</Pill>{o.slot && <Pill tone="outline" icon="clock">{o.slot.day} {o.slot.slot}</Pill>}</span></span>
                  <ScoreRing value={o.score} size={52} stroke={5} />
                </div>
                <span className="small">{o.why}</span>
                <span className="small faint"><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {o.evidence}</span>
                <div className="sa-parts">{Object.entries(o.parts || {}).map(([k, v]) => (
                  <div key={k}><span>{PART_LABEL[k] || k} <b className="strong">{v}</b></span><span className="sa-meter" style={{ height: 4 }}><span style={{ width: `${v}%`, background: "var(--sa-primary)" }} /></span></div>
                ))}</div>
              </div>
            ))}
          </div>
          <Card className="mt" title="All gaps" sub="What competitors under-do, and what you are missing.">
            <div className="sa-list">{(I.gaps || []).map((g) => (
              <div key={g.id} className="sa-li" style={{ alignItems: "flex-start" }}>
                <Pill tone={TYPE_TONE[g.type]}>{g.type}</Pill>
                <span className="grow"><b>{g.title}</b><small style={{ display: "block" }}>{g.detail}</small><small className="faint" style={{ display: "block" }}><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {g.evidence}</small></span>
                <b className="strong">{g.score}</b>
              </div>
            ))}</div>
          </Card>
        </>
      )}

      {/* ───── strategy ───── */}
      {tab === "strategy" && (
        <>
          {st.positioning && <div className="sa-banner tone-violet mt"><span className="sa-banner-ic"><Icon name="target" size={20} /></span><div className="sa-banner-body"><h4>Positioning <Src ai={st.positioningSource === "ai"} /></h4><p>{st.positioning}</p></div></div>}
          <div className="sa-kpis mt">
            <div className="sa-kpi"><span>Posts per week</span><b>{st.cadence?.postsPerWeek}</b><small>competitor median</small></div>
            <div className="sa-kpi"><span>Target engagement rate</span><b>{st.kpis?.engagementRate ?? "—"}%</b><small>competitor median</small></div>
            <div className="sa-kpi"><span>Target comments / post</span><b>{st.kpis?.commentsPerPost ?? "—"}</b><small>competitor median</small></div>
            <div className="sa-kpi"><span>Comments / 100 likes</span><b>{st.kpis?.commentsPer100Likes ?? "—"}</b><small>conversation target</small></div>
          </div>
          <div className="sa-grid g-2 mt">
            <Card title="Format mix" sub="Weighted by competitor performance and your format gaps.">
              <div className="row wrap" style={{ gap: 20 }}>
                <Donut size={160} thickness={22} center={`${st.cadence?.postsPerWeek}`} sub="posts / week" items={(st.formatMix || []).map((f) => ({ label: f.format, value: f.pct, color: FORMAT_COLORS[f.format] || "#9a9db0" }))} />
                <div className="grow">{(st.formatMix || []).map((f) => (
                  <div key={f.format} className="row between small" style={{ padding: "5px 0" }}><span className="row" style={{ gap: 7 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: FORMAT_COLORS[f.format], display: "inline-block" }} />{FORMAT_LABEL[f.format] || f.format}</span><b className="strong">{f.pct}%</b></div>
                ))}</div>
              </div>
            </Card>
            <Card title="Content pillars" sub="From the top opportunities + your product.">
              <HBarList labelWidth={160} max={100} format={(v) => `${v}%`} rows={(st.pillars || []).map((p) => ({ key: p.pillar, label: p.pillar, value: p.pct, display: `${p.pct}%` }))} />
              <ul className="small muted" style={{ paddingLeft: 18, margin: "10px 0 0" }}>{(st.pillars || []).map((p) => <li key={p.pillar}><b className="strong">{p.pillar}:</b> {p.why}</li>)}</ul>
            </Card>
          </div>
          <Card className="mt" title="Weekly calendar" sub="Best day/time windows (high performance, low competition) × format mix × pillars.">
            <div className="sa-cal">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
                const items = (st.calendar || []).filter((c) => c.day === d);
                return (
                  <div key={d} className={cx("sa-cal-day", !items.length && "off")}><b>{d}</b>
                    {items.map((c, i) => (
                      <span key={i} className="sa-cal-post" style={{ "--fc": FORMAT_COLORS[c.format] }}><b>{FORMAT_LABEL[c.format] || c.format}</b><small>{c.pillar}</small><small><Icon name="clock" size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {c.slot}</small></span>
                    ))}
                    {!items.length && <small className="faint">rest</small>}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="mt" title="Hashtag sets" sub="Only hashtags seen in real competitor posts.">
            <div className="sa-section-label" style={{ marginBottom: 6 }}>Core — shared by several competitors</div>
            <div className="sa-chipset">{(st.hashtagSets?.core || []).map((h) => <span key={h} className="sa-igtag">{h}</span>)}{!st.hashtagSets?.core?.length && <span className="small muted">—</span>}</div>
            <div className="sa-section-label mt" style={{ marginBottom: 6 }}>Niche — they use, you don't</div>
            <div className="sa-chipset">{(st.hashtagSets?.niche || []).map((h) => <span key={h} className="sa-igtag">{h}</span>)}{!st.hashtagSets?.niche?.length && <span className="small muted">—</span>}</div>
          </Card>
        </>
      )}

      {/* ───── briefs ───── */}
      {tab === "briefs" && (
        <>
          <div className="sa-kpis mt">
            <div className="sa-kpi"><span>Ideas</span><b>{ideas.length}</b><small>{ideas[0]?.source === "ai" ? "written by AI" : "code templates"}</small></div>
            <div className="sa-kpi"><span>Passed quality check</span><b>{I.quality?.passed ?? 0}/{I.briefs?.length || 0}</b><small>pass ≥ 70</small></div>
            <div className="sa-kpi"><span>Average QC score</span><b>{I.quality?.avgScore ?? "—"}</b><small>/100</small></div>
          </div>
          <div className="sa-grid g-2 mt">
            {(I.briefs || []).map((b) => {
              const q = qByIdea.get(b.ideaIndex);
              return (
                <Card key={b.id} title={<>{b.title} <Pill tone="violet">{FORMAT_LABEL[b.format] || b.format}</Pill></>} sub={`${b.pillar} · ${b.objective}`}
                  action={q && <ScoreRing value={q.score} size={54} stroke={5} />}>
                  <p className="small" style={{ margin: 0 }}><b className="strong">Hook:</b> “{b.hook}”</p>
                  {b.angle && <p className="small muted" style={{ margin: "6px 0 0" }}>{b.angle}</p>}
                  <div className="sa-grid g-2 mt-s" style={{ gap: 12 }}>
                    <div>
                      <div className="sa-section-label" style={{ marginBottom: 6 }}>Structure · {b.spec?.ratio}{b.spec?.length ? ` · ${b.spec.length}` : ""}{b.spec?.slides ? ` · ${b.spec.slides} slides` : ""}</div>
                      <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>{b.structure.map((s) => <li key={s}>{s}</li>)}</ol>
                      <div className="small mt-s"><b className="strong">Caption:</b> {b.caption.length}{b.caption.includeQuestion ? " · end with a question" : ""} · {b.caption.cta}</div>
                      {b.slot && <div className="small"><b className="strong">Post:</b> {b.slot.day} {b.slot.slot}</div>}
                    </div>
                    <div>
                      <div className="sa-section-label" style={{ marginBottom: 6 }}>Quality check</div>
                      <div className="sa-checks">{(q?.checks || []).map((c) => (
                        <div key={c.key} title={c.detail}><Icon name={c.pass ? "checkCircle" : "alert"} size={14} style={{ color: c.pass ? "var(--sa-green)" : "var(--sa-red)", flexShrink: 0, marginTop: 1 }} /><span>{c.label}{!c.pass && <span className="red"> — {c.detail}</span>}</span></div>
                      ))}</div>
                    </div>
                  </div>
                  <div className="sa-chipset mt-s">{b.hashtags.map((h) => <span key={h} className="sa-igtag">{h}</span>)}</div>
                  {b.references?.length > 0 && <div className="small faint mt-s">References: {b.references.map((r, i) => <a key={i} className="sa-link" href={r.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, marginRight: 8 }}>@{r.username} ({r.multiple}×)</a>)}</div>}
                  {b.evidence && <div className="small faint mt-s"><Icon name="database" size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {b.evidence}</div>}
                </Card>
              );
            })}
          </div>
          <p className="small faint mt">Approve the report in step 4 to turn briefs into draft posts (Image Agent for photos/carousels, Video Agent for reels).</p>
        </>
      )}

      {/* ───── results ───── */}
      {tab === "results" && (
        <Card className="mt" title="Performance analysis & strategy improvement" sub="Real results of posts created from this report vs the strategy KPIs (Instagram Graph API)."
          action={<Btn variant="primary" icon="refresh" loading={analyzing} onClick={onAnalyzeResults}>Analyse results</Btn>}>
          {!I.results ? <Empty icon="trend" title="No results yet">Create posts from approved ideas, publish them, then click “Analyse results”.</Empty> : (
            <>
              <div className="sa-kpis">
                <div className="sa-kpi"><span>Posts created</span><b>{I.results.summary.created}</b></div>
                <div className="sa-kpi"><span>Published</span><b>{I.results.summary.published}</b></div>
                <div className="sa-kpi"><span>Avg engagement rate</span><b>{I.results.summary.avgEngagementRate ?? "—"}{I.results.summary.avgEngagementRate != null ? "%" : ""}</b><small>target {I.results.summary.targetEngagementRate ?? "—"}%</small></div>
                <div className="sa-kpi"><span>Above / below target</span><b>{I.results.summary.above} / {I.results.summary.below}</b><small>analysed {timeAgo(I.results.analyzedAt)}</small></div>
              </div>
              <div className="sa-table-wrap mt">
                <table className="sa-table">
                  <thead><tr><th>Post</th><th>Status</th><th>Likes</th><th>Comments</th><th>Reach</th><th>Saves</th><th>Shares</th><th>ER</th><th>vs target</th></tr></thead>
                  <tbody>{I.results.posts.map((r, i) => (
                    <tr key={i}><td>{r.permalink ? <a className="sa-link" href={r.permalink} target="_blank" rel="noreferrer">{r.title}</a> : <b>{r.title}</b>}<div className="small faint">{FORMAT_LABEL[r.format] || r.format} · {r.pillar}</div></td>
                      <td><Pill tone={r.status === "published" ? "green" : "gray"}>{r.status}</Pill></td>
                      <td className="num">{fmt(r.likes)}</td><td className="num">{fmt(r.comments)}</td><td className="num">{fmt(r.insights?.reach)}</td><td className="num">{fmt(r.insights?.saved)}</td><td className="num">{fmt(r.insights?.shares)}</td>
                      <td className="num">{r.engagementRate ?? "—"}{r.engagementRate != null ? "%" : ""}</td>
                      <td>{r.verdict === "pending" ? <span className="faint small">pending</span> : <Pill tone={r.verdict === "above" ? "green" : r.verdict === "below" ? "red" : "amber"}>{r.verdict}</Pill>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="sa-section-label mt" style={{ marginBottom: 8 }}>Strategy improvements</div>
              {I.results.improvements.length ? <div className="sa-list">{I.results.improvements.map((x) => (
                <div key={x.action} className="sa-li" style={{ alignItems: "flex-start" }}><Pill tone={x.priority === "high" ? "red" : "amber"}>{x.priority}</Pill><span className="grow"><b>{x.action}</b><small className="faint" style={{ display: "block" }}>{x.evidence}</small></span></div>
              ))}</div> : <p className="small muted">Needs published posts with results.</p>}
            </>
          )}
        </Card>
      )}
      {!ai && report.analysis?.source === "code" && <p className="small faint mt">{report.analysisError ? `The AI writing call failed (${report.analysisError}) — summary and ideas were built by code from the numbers instead.` : "AI writing was off for this run — summary and ideas were built by code from the numbers (0 LLM calls)."}</p>}
    </div>
  );
}
