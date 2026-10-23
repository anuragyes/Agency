// Audience intelligence — pick a channel.
//   Instagram  -> REAL data from the Instagram Graph API (GET /api/instagram/audience):
//                 followers, reach, engagement, age & gender, locations, online times, formats, comment sentiment
//   Others     -> "Coming soon" until their API is connected
// AI personas / interests / pain points still come from the workspace's market research.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { AreaChart, BarChart, Donut, Heatmap, Meter } from "../ui/charts";
import { Banner, Btn, Card, DemoTag, Empty, LiveTag, PageHeader, Pill, Segmented, Spinner, StatCard, cx, fmt, timeAgo, useAsync } from "../ui/kit";
import { PERSONAS } from "../mock";
import { collect, useWorkspace } from "../store";
import { getInstagramAudience } from "../api";

const GRADS = ["linear-gradient(135deg,#6366f1,#a855f7)", "linear-gradient(135deg,#8b5cf6,#d946ef)", "linear-gradient(135deg,#f97316,#f43f5e)"];
const INTERESTS = [["Marketing tech", 3.4], ["Entrepreneurship", 2.9], ["AI & automation", 2.7], ["Productivity", 2.2], ["Design", 1.9], ["Remote work", 1.8], ["SaaS", 1.7], ["Podcasts", 1.5], ["E-commerce", 1.4], ["Personal finance", 1.2], ["Travel", 1.1]];

// Channels — `live: true` means the backend reads that platform's real API
const CHANNELS = [
  { id: "instagram", name: "Instagram", live: true },
  { id: "facebook", name: "Facebook" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
  { id: "x", name: "X" },
  { id: "threads", name: "Threads" },
  { id: "pinterest", name: "Pinterest" },
];
const CHANNEL_KEY = "sociva.audienceChannel";
const readJson = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/* ── helpers ── */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BUCKETS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
const BUCKET_RANGE = ["12–3 AM", "3–6 AM", "6–9 AM", "9 AM–12 PM", "12–3 PM", "3–6 PM", "6–9 PM", "9 PM–12 AM"];
const HOUR = 3600 * 1000;
// Meta sends "2026-10-15T07:00:00+0000" — add the colon so every browser parses it
const parseDate = (s) => new Date(String(s || "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
const pct = (v) => `${Math.round(v * 10) / 10}%`;

/** [{ date, value }] -> 7×8 heatmap in the viewer's local time + peak cell */
function toGrid(points) {
  const g = DAYS.map(() => Array(8).fill(0));
  for (const { date, value } of points) {
    if (!value || Number.isNaN(date.getTime())) continue;
    g[(date.getDay() + 6) % 7][Math.floor(date.getHours() / 3)] += value;
  }
  let max = 0, peak = null;
  g.forEach((row, ri) => row.forEach((v, ci) => { if (v > max) { max = v; peak = [ri, ci]; } }));
  return { rows: DAYS.map((label, i) => ({ label, values: g[i].map((v) => (max ? v / max : 0)) })), peak };
}

/** online_followers rows: { endTime, hours: { "0": n … "23": n } } — hour keys count from the start of that day */
const onlinePoints = (online = []) =>
  online.flatMap(({ endTime, hours }) => {
    const start = parseDate(endTime).getTime() - 24 * HOUR;
    return Object.entries(hours || {}).map(([h, v]) => ({ date: new Date(start + Number(h) * HOUR), value: Number(v) || 0 }));
  });

const regionName = (() => {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return (c) => { try { return dn.of(c) || c; } catch { return c; } };
  } catch { return (c) => c; }
})();
const flag = (c) => (/^[A-Z]{2}$/.test(c || "") ? String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))) : "📍");

const FORMAT_ICON = { REELS: "video", CAROUSEL_ALBUM: "carousel", IMAGE: "image", VIDEO: "video", STORY: "layers" };

/* ───────────────────────── page ───────────────────────── */
export default function Audience() {
  const [channel, setChannel] = useState(() => readJson(CHANNEL_KEY, "instagram"));
  const [force, setForce] = useState(0);
  const meta = CHANNELS.find((c) => c.id === channel) || CHANNELS[0];
  const choose = (id) => { setChannel(id); writeJson(CHANNEL_KEY, id); };

  const ig = useAsync(
    () => (meta.id === "instagram" ? getInstagramAudience(force > 0).then((r) => r.data) : Promise.resolve(null)),
    [meta.id, force]
  );
  const d = meta.id === "instagram" ? ig.data : null;

  const sub = d?.profile
    ? `Real audience data for @${d.profile.username} on Instagram — ${fmt(d.profile.followers)} followers.`
    : "Who follows you, what they care about and when they're listening. Pick a channel to see its real data.";

  return (
    <>
      <PageHeader title="Audience intelligence" sub={sub}>
        {meta.live && <Btn icon="refresh" loading={ig.loading && !!d} onClick={() => setForce((f) => f + 1)}>Refresh</Btn>}
        <Btn icon="download" onClick={() => window.print()}>Export</Btn>
      </PageHeader>

      {/* channel picker */}
      <div className="row wrap" style={{ gap: 8 }} role="radiogroup" aria-label="Social channel">
        {CHANNELS.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={meta.id === c.id}
            className={cx("sa-chip", meta.id === c.id && "on")} onClick={() => choose(c.id)}
            title={c.live ? `Real audience data from the ${c.name} API` : `${c.name} audience data is coming soon`}
            style={{ opacity: c.live || meta.id === c.id ? 1 : 0.7 }}>
            <PlatformIcon platform={c.id} size={20} />{c.name}
            {c.live ? <LiveTag /> : <Pill tone="gray">Soon</Pill>}
          </button>
        ))}
      </div>

      {!meta.live ? (
        <ComingSoon name={meta.name} id={meta.id} onBack={() => choose("instagram")} />
      ) : ig.loading && !d ? (
        <Card className="mt"><div className="row" style={{ gap: 12, padding: "28px 4px" }}><Spinner /> <span className="muted">Fetching your Instagram audience from the Graph API…</span></div></Card>
      ) : ig.error && !d ? (
        <div className="mt">
          <Banner icon="alert" tone="amber" title="Couldn't load your Instagram audience" actions={<Btn icon="refresh" onClick={() => setForce((f) => f + 1)}>Try again</Btn>}>
            {ig.error.message}
          </Banner>
        </div>
      ) : d ? (
        <InstagramAudience d={d} />
      ) : null}
    </>
  );
}

function ComingSoon({ name, id, onBack }) {
  return (
    <Card className="mt">
      <Empty icon="plug" title={`${name} audience — coming soon`}
        action={<Btn variant="grad" icon="instagram" onClick={onBack}>See real Instagram data</Btn>}>
        <span className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 6 }}><PlatformIcon platform={id} size={28} /></span>
        We're connecting the {name} API. Followers, demographics, online times and engagement will show here as soon as it's live.
      </Empty>
    </Card>
  );
}





/* ───────────────────────── Instagram (real) ───────────────────────── */
function InstagramAudience({ d }) {
  const { research } = useWorkspace();
  const ints = collect(research.data, (p) => p.audienceInsights?.interests);
  const pains = collect(research.data, (p) => p.audienceInsights?.painPoints);
  const [where, setWhere] = useState("countries");

  const p = d.profile || {};
  const a = d.activity || {};
  const errors = d.errors || {};
  const demo = d.demographics;
  const minF = d.minFollowersForDemographics || 100;
  const locked = (p.followers ?? 0) < minF;
  const lockedText = `Instagram only shares this for accounts with ${minF}+ followers — @${p.username} has ${fmt(p.followers)}. It fills in automatically once you get there.`;

  // when online: real online_followers, else fall back to when your posts got engagement
  const online = d.online ? toGrid(onlinePoints(d.online)) : null;
  const postGrid = toGrid((d.posts || []).map((x) => ({ date: parseDate(x.timestamp), value: x.engagement || 0 })));
  const grid = online || (postGrid.peak ? postGrid : null);

  const locations = where === "countries"
    ? (demo?.countries || []).map((c) => ({ key: c.code, label: <>{flag(c.code)} {regionName(c.code)}</>, pct: c.pct }))
    : (demo?.cities || []).map((c) => ({ key: c.name, label: <>📍 {c.name}</>, pct: c.pct }));
  const maxLoc = Math.max(1, ...locations.map((l) => l.pct));

  const daily = a.reachDaily || [];
  const formats = d.formats || [];
  const maxRate = Math.max(0.1, ...formats.map((f) => f.engagementRate ?? f.avgEngagement));
  const s = d.sentiment;

  return (
    <>
      {/* KPIs */}
      <div className="sa-grid g-4 mt">
        <StatCard icon="users" label="Followers" value={fmt(p.followers)}
          delta={a.follows != null ? `+${fmt(a.follows)}` : undefined} deltaLabel={a.follows != null ? `new${a.unfollows != null ? `, −${fmt(a.unfollows)} lost` : ""} · 30d` : undefined} />
        <StatCard icon="eye" iconTone="blue" label="Accounts reached · 30 days" value={fmt(a.reach)}
          spark={daily.length > 1 ? daily.map((x) => x.value) : undefined} sparkColor="#0ea5e9" />
        <StatCard icon="heart" iconTone="pink" label="Accounts engaged · 30 days" value={fmt(a.accountsEngaged)}
          delta={a.totalInteractions != null ? fmt(a.totalInteractions) : undefined} deltaLabel="interactions" />
        <StatCard icon="chart" iconTone="green" label="Engagement rate / post" value={d.engagementRate != null ? `${d.engagementRate}%` : "—"}
          delta={d.avgEngagement != null ? fmt(d.avgEngagement) : undefined} deltaLabel="avg likes + comments" />
      </div>

      <div className="sa-grid g-3w mt">
        {/* Age & gender */}
        <Card title={<>Age &amp; gender {demo?.ages?.length > 0 && <LiveTag />}</>} sub={demo?.ages?.length ? "Your followers, from Instagram insights" : undefined}>
          {demo?.ages?.length ? (
            <>
              <BarChart height={230} colors={["#a5a0f8"]} names={["Share"]} format={(v) => `${v}%`} groups={demo.ages.map((x) => ({ label: x.label.replace("-", "–"), values: [x.pct] }))} />
              <div className="row between small muted mt"><span>Women {pct(demo.gender.women)}</span><span>Men {pct(demo.gender.men)}</span><span>Other {pct(demo.gender.other)}</span></div>
              <div className="row" style={{ gap: 3, marginTop: 8 }}>
                <span style={{ height: 8, flex: demo.gender.women || 0.01, borderRadius: 8, background: "#d946ef" }} />
                <span style={{ height: 8, flex: demo.gender.men || 0.01, borderRadius: 8, background: "#5b4cf6" }} />
                <span style={{ height: 8, flex: demo.gender.other || 0.01, borderRadius: 8, background: "#f59e0b" }} />
              </div>
            </>
          ) : (
            <Empty icon="lock" title={locked ? `Unlocks at ${minF} followers` : "No age & gender data yet"}>{errors.ageGender || (locked ? lockedText : "Instagram hasn't returned demographics for this account yet.")}</Empty>
          )}
        </Card>

        {/* Online times */}
        <Card title={<>{online ? "When followers are online" : "Best time to post"} {grid && <LiveTag />}</>}
          sub={grid ? (online ? "Last 30 days · your local time" : `When your last ${(d.posts || []).length} posts got likes & comments · local time`) : undefined}>
          {grid ? (
            <>
              {grid.peak && <div className="mt-s" style={{ marginBottom: 10 }}><Pill icon="clock">Peak: {DAYS[grid.peak[0]]} {BUCKET_RANGE[grid.peak[1]]}</Pill></div>}
              <Heatmap cols={BUCKETS} rows={grid.rows} highlight={grid.peak} />
              {!online && <p className="small faint mt-s">Follower online times {locked ? `unlock at ${minF} followers` : "aren't available yet"} — until then this shows when your posts collected likes & comments.</p>}
            </>
          ) : (
            <Empty icon="clock" title="Not enough activity yet">{locked ? lockedText : "Post a few times and this fills in."}</Empty>
          )}
        </Card>

        {/* Locations */}
        <Card title={<>Top locations {locations.length > 0 && <LiveTag />}</>}>
          <div style={{ marginBottom: 8 }}><Segmented options={[{ value: "countries", label: "Countries" }, { value: "cities", label: "Cities" }]} value={where} onChange={setWhere} /></div>
          {locations.length ? locations.slice(0, 6).map((l) => (
            <div key={l.key} style={{ padding: "8px 0" }}>
              <div className="row between"><span className="row">{l.label}</span><b className="strong">{pct(l.pct)}</b></div>
              <div className="mt-s"><Meter value={l.pct} max={maxLoc} /></div>
            </div>
          )) : (
            <Empty icon="globe" title={locked ? `Unlocks at ${minF} followers` : "No location data yet"}>{errors[where] || (locked ? lockedText : "Instagram hasn't returned locations for this account yet.")}</Empty>
          )}
        </Card>
      </div>

      <div className="sa-grid g-main mt">
        {/* Interests + real hashtags */}
        <Card title={<>Interests &amp; affinities {ints.length > 0 ? <LiveTag>research</LiveTag> : <DemoTag title="Run market research for this workspace to get real interests" />}</>} action={<span className="small muted">{ints.length ? "from market research" : "vs. average social user"}</span>}>
          <div className="sa-chipset">
            {ints.length ? ints.slice(0, 16).map(({ value }, i) => <span key={value} className={`sa-chip ${i < 3 ? "on" : ""}`} style={{ height: 44 }}>{value}</span>)
              : INTERESTS.map(([n, v], i) => <span key={n} className={`sa-chip ${i < 3 ? "on" : ""}`} style={{ height: 44 }}>{n} <b>{v}×</b></span>)}
          </div>
          {d.topHashtags?.length > 0 && (
            <>
              <div className="sa-section-label mt">Hashtags your audience engages with <LiveTag /></div>
              <div className="sa-chipset mt-s">
                {d.topHashtags.slice(0, 12).map((h) => (
                  <span key={h.hashtag} className="sa-chip" style={{ height: 36 }} title={`Used in ${h.posts} post(s) · avg ${h.avgEngagement ?? "—"} likes + comments`}>
                    {h.hashtag} {h.avgEngagement != null && <b>{fmt(h.avgEngagement)}</b>}
                  </span>
                ))}
              </div>
            </>
          )}
          {pains.length > 0 && (
            <>
              <div className="sa-section-label mt">Pain points the research found</div>
              <div className="sa-grid g-2 mt-s" style={{ gap: 8 }}>{pains.slice(0, 8).map(({ value }) => <div key={value} className="row small"><Icon name="flame" size={16} style={{ color: "#f97316" }} />{value}</div>)}</div>
            </>
          )}
        </Card>

        {/* Sentiment */}
        <Card title={<>Comment sentiment {s?.analyzed > 0 && <LiveTag />}</>} sub={s?.analyzed > 0 ? `${s.analyzed} comments on your last ${s.postsScanned} posts` : undefined}>
          {s?.analyzed > 0 ? (
            <div className="row" style={{ gap: 24 }}>
              <Donut size={170} thickness={18} center={String(s.score)} sub="/10" items={[{ value: s.positive, color: "#10b981" }, { value: s.neutral, color: "#d7d8e2" }, { value: s.negative, color: "#f43f5e" }]} />
              <div className="grow">{[["Positive", s.positive, "#10b981"], ["Neutral", s.neutral, "#9ca3af"], ["Negative", s.negative, "#f43f5e"]].map(([l, v, c]) => (
                <div key={l} style={{ padding: "8px 0" }}><div className="row between"><span>{l}</span><b className="strong">{pct(v)}</b></div><div className="mt-s"><Meter value={v} color={c} /></div></div>
              ))}</div>
            </div>
          ) : (
            <Empty icon="message" title="Not enough comments yet">
              {errors.sentiment || "Sentiment is worked out from the comments people leave on your posts (your own replies are skipped). It appears once your audience starts commenting."}
            </Empty>
          )}
        </Card>
      </div>

      <div className="sa-grid g-main mt">
        {/* Reach */}
        <Card title={<>Reach, last 30 days {daily.length > 0 && <LiveTag />}</>} sub="Unique accounts that saw your content each day"
          action={a.reach != null && <div className="sa-legend"><span><i style={{ background: "#5b4cf6" }} />Followers {fmt(a.reachFollowers ?? 0)}</span><span><i style={{ background: "#0ea5e9" }} />Non-followers {fmt(a.reachNonFollowers ?? 0)}</span></div>}>
          {daily.length ? (
            <AreaChart height={240} labels={daily.map((x) => parseDate(x.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}
              series={[{ name: "Reach", color: "#5b4cf6", data: daily.map((x) => x.value) }]} />
          ) : (
            <Empty icon="eye" title="No reach data">{errors.activity || a.errors?.reachDaily || "Instagram didn't return reach for the last 30 days."}</Empty>
          )}
          <div className="sa-grid g-6 mt" style={{ gap: 8 }}>
            {[["eye", "Views", a.views], ["heart", "Likes", a.likes], ["message", "Comments", a.comments], ["share", "Shares", a.shares], ["bookmark", "Saves", a.saves], ["userPlus", "New follows", a.follows]].map(([ic, l, v]) => (
              <div key={l} className="row small" style={{ gap: 6 }}><Icon name={ic} size={15} className="muted" /><span className="muted">{l}</span><b className="strong">{fmt(v)}</b></div>
            ))}
          </div>
        </Card>

        {/* Formats */}
        <Card title={<>Formats they love {formats.length > 0 && <LiveTag />}</>} action={<span className="small muted">avg. engagement rate</span>}>
          {formats.length ? formats.map((f) => (
            <div key={f.key} className="row" style={{ padding: "11px 0" }}>
              <span className="sa-ic tone-violet" style={{ width: 36, height: 36 }}><Icon name={FORMAT_ICON[f.key] || "image"} size={17} /></span>
              <div style={{ width: 130 }}><b className="strong">{f.label}</b><div className="small faint">{f.posts} post{f.posts === 1 ? "" : "s"}</div></div>
              <div className="grow"><Meter value={f.engagementRate ?? f.avgEngagement} max={maxRate} color="linear-gradient(90deg,#5b4cf6,#d946ef)" height={7} /></div>
              <b className="strong">{f.engagementRate != null ? `${f.engagementRate}%` : fmt(f.avgEngagement)}</b>
            </div>
          )) : <Empty icon="layers" title="No posts yet">Publish a few posts and we'll compare Reels, Carousels and Images.</Empty>}
        </Card>
      </div>


    </>
  );
}
