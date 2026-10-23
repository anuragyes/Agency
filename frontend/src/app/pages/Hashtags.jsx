// Hashtag engine — 100% REAL data from each platform's official API. No LLM on this page.
//   Platform picker: Instagram is live; YouTube, TikTok, X, Threads, Pinterest, Facebook, LinkedIn are ready
//   for their APIs (backend/services/hashtags/providers/<platform>.js). A platform turns live in this
//   picker as soon as its provider has an explore() function — no frontend change needed.
//   1. Find real hashtags:  your seeds -> real top + recent posts -> hashtags used in 2+ DIFFERENT posts
//                           (noise removed in backend/services/hashtags/hashtagQuality.js), with likes / comments
//                           (POST /api/hashtags/:platform/explore)
//   2. Competitor (Instagram only): a top brand's recent posts, engagement and hashtags (Business Discovery API)
import { useEffect, useMemo, useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import IgPostCard from "../ui/IgPostCard";
import { Btn, Card, Empty, LiveTag, PageHeader, Pill, Segmented, Spinner, Tabs, cx, fmt, timeAgo, useToast } from "../ui/kit";
import { useWorkspace } from "../store";
import { exploreHashtags, getHashtagQuota, getInstagramCompetitor, listHashtagPlatforms } from "../api";

const MAX_TAGS_PER_POST = 6; // same limit as the Content Editor
const SETS_KEY = "sociva.hashtagSets";
const PLATFORM_KEY = "sociva.hashtagPlatform";
const DATA_KEY = (platform, pid) => `sociva.hashtags.${platform}.${pid || "none"}`;
const OLD_IG_KEY = (pid) => `sociva.igExplore.${pid || "none"}`; // before the platform picker
const COMP_KEY = "sociva.igCompetitors";

// Used until GET /api/hashtags/platforms answers (or if it fails)
const FALLBACK_PLATFORMS = [
  { id: "instagram", name: "Instagram", implemented: true, configured: true, features: { explore: true, quota: true } },
  ...[["youtube", "YouTube"], ["tiktok", "TikTok"], ["x", "X"], ["threads", "Threads"], ["pinterest", "Pinterest"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"]]
    .map(([id, name]) => ({ id, name, implemented: false, configured: false, features: {} })),
];

const readJson = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
// Results saved before the noise filter (no "removed" field) are ignored -> search again for clean hashtags
const readData = (platform, pid) => {
  const d = readJson(DATA_KEY(platform, pid), null) ?? (platform === "instagram" ? readJson(OLD_IG_KEY(pid), null) : null);
  return d?.removed ? d : null;
};

const COLUMNS = [
  { key: "score", label: "Strength", title: "Relative score: used in top posts, active recently, shared across seeds, engagement" },
  { key: "posts", label: "Posts", title: "How many DIFFERENT real posts use this hashtag (copies of the same post count once)" },
  { key: "topPosts", label: "In top", title: "Appears in the platform's TOP posts for your seed hashtags" },
  { key: "recentPosts24h", label: "Recent", title: "Used in the most recent posts (Instagram: last 24 hours)" },
  { key: "avgLikes", label: "Avg likes", title: "Average likes of the posts that use it" },
  { key: "avgComments", label: "Avg comments", title: "Average comments of the posts that use it" },
];

export default function Hashtags() {
  const { current, profile } = useWorkspace();
  const pid = current?._id;
  const toast = useToast();

  const [platforms, setPlatforms] = useState(FALLBACK_PLATFORMS);
  const [platform, setPlatform] = useState(() => readJson(PLATFORM_KEY, "instagram"));
  const meta = platforms.find((p) => p.id === platform) || platforms[0];
  const live = Boolean(meta?.implemented);

  const [q, setQ] = useState(() => profile?.keywords?.slice(0, 3).join(", ") || "");
  const [data, setData] = useState(() => readData(platform, pid));
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(() => data?.quota || null);
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState({ key: "score", dir: -1 });
  const [postView, setPostView] = useState("top");
  const [tagFilter, setTagFilter] = useState("");
  const [showPosts, setShowPosts] = useState(12);
  const [selected, setSelected] = useState(() => new Set());
  const [sets, setSets] = useState(() => readJson(SETS_KEY, []));

  // competitor (Instagram Business Discovery)
  const [comp, setComp] = useState(null);
  const [compQ, setCompQ] = useState("");
  const [compBusy, setCompBusy] = useState(false);
  const [compHistory, setCompHistory] = useState(() => readJson(COMP_KEY, []));

  useEffect(() => { listHashtagPlatforms().then((list) => list?.length && setPlatforms(list)).catch(() => { }); }, []);
  useEffect(() => {
    setQuota(null);
    if (live && meta?.features?.quota) getHashtagQuota(platform).then((r) => setQuota(r.data)).catch(() => { });
  }, [platform, live, meta?.features?.quota, data]);
  useEffect(() => {
    if (!q && profile?.keywords?.length) setQ(profile.keywords.slice(0, 3).join(", "));
    setData(readData(platform, pid));
    setTab("all"); setTagFilter(""); setShowPosts(12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, platform]);

  const choosePlatform = (id) => { setPlatform(id); writeJson(PLATFORM_KEY, id); };
  const toggle = (t) => setSelected((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const applyResult = (r) => {
    setData(r);
    writeJson(DATA_KEY(platform, pid), r);
    setTab("all"); setTagFilter(""); setShowPosts(12);
    setSelected(new Set(r.hashtags.slice(0, MAX_TAGS_PER_POST).map((h) => h.hashtag)));
  };

  /* ── 1. Find real hashtags (the seeds you type) ── */
  const explore = async () => {
    if (!live) return;
    if (!q.trim()) { toast("Type 1–4 hashtags or keywords, e.g. ghee, desi ghee", "error"); return; }
    setBusy(true);
    try {
      const r = await exploreHashtags(platform, q);
      applyResult(r);
      toast(`${r.hashtags.length} real hashtags from ${r.mediaAnalyzed} ${meta.name} posts`, "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  /* ── 2. Competitor / top brand (Instagram) ── */
  const lookup = async (name = compQ) => {
    const u = String(name).trim().replace(/^@/, "");
    if (!u) return;
    setCompBusy(true);
    try {
      const r = await getInstagramCompetitor(u);
      setComp(r.data);
      const next = [r.data.profile.username, ...compHistory.filter((x) => x !== r.data.profile.username)].slice(0, 6);
      setCompHistory(next); writeJson(COMP_KEY, next);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCompBusy(false);
    }
  };

  /* ── table rows ── */
  const rows = useMemo(() => {
    let list = data?.hashtags || [];
    if (tab === "top") list = list.filter((h) => h.topPosts > 0);
    if (tab === "recent") list = list.filter((h) => h.recentPosts24h > 0);
    if (tab === "niche") list = list.filter((h) => !h.isSeed && h.posts >= 2 && h.posts <= Math.max(3, (data?.mediaAnalyzed || 0) * 0.08));
    const v = (h) => h[sort.key] ?? -1;
    return [...list].sort((a, b) => (v(a) - v(b)) * sort.dir);
  }, [data, tab, sort]);

  const removedTotal = data?.removed ? (data.removed.oneOff || 0) + (data.removed.spam || 0) + (data.removed.samePost || 0) : 0;
  const maxScore = Math.max(1, ...(data?.hashtags || []).map((h) => h.score || 0));
  const sel = [...selected];

  const posts = useMemo(() => {
    const list = (postView === "top" ? data?.topPosts : data?.recentPosts) || [];
    return tagFilter ? list.filter((p) => p.hashtags.includes(tagFilter)) : list;
  }, [data, postView, tagFilter]);

  const saveSet = () => {
    const name = window.prompt("Name this hashtag set", "New set");
    if (!name) return;
    const next = [...sets, { name, tags: sel }];
    setSets(next); writeJson(SETS_KEY, next);
    toast(`Saved "${name}"`, "success");
  };
  const deleteSet = (i) => { const next = sets.filter((_, j) => j !== i); setSets(next); writeJson(SETS_KEY, next); };

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
  const showTagPosts = (t) => { setTagFilter(t); setShowPosts(12); document.getElementById("hashtag-posts")?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <>
      <PageHeader
        title={<>Hashtag engine </>}
        sub="Real hashtags from each platform's top and latest posts — with the likes and comments behind them. No AI guessing.">
        {quota && <Pill tone={quota.remaining <= 5 ? "amber" : "gray"} icon="search" title={meta?.quotaNote || ""}>Searches this week: {quota.used}/{quota.limit}</Pill>}
      </PageHeader>

      {/* platform picker */}
      <div className="row wrap" style={{ gap: 8 }} role="radiogroup" aria-label="Platform">
        {platforms.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={platform === p.id}
            className={cx("sa-chip", platform === p.id && "on")} onClick={() => choosePlatform(p.id)}
            title={p.implemented ? `Real hashtags from ${p.source || p.name}` : `${p.name} is not connected yet`}
            style={{ opacity: p.implemented ? 1 : 0.7 }}>
            <PlatformIcon platform={p.id} size={20} />{p.name}
            {!p.implemented && <Pill tone="gray">Soon</Pill>}
            {p.implemented && !p.configured && <Pill tone="amber">Setup</Pill>}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="sa-prompt row mt-s" style={{ padding: "12px 12px 12px 20px", opacity: live ? 1 : 0.6 }}>
        <Icon name="hash" size={20} style={{ color: "var(--sa-primary)" }} />
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && explore()} disabled={!live}
          placeholder="1–4 hashtags or keywords, comma separated — e.g. ghee, desi ghee, a2 ghee"
          style={{ border: 0, outline: 0, fontSize: 17, height: 44, background: "none" }} aria-label="Seed hashtags" />
        <span className="sa-chip"><PlatformIcon platform={platform} size={20} />{meta?.name}</span>
        <Btn variant="grad" icon="search" onClick={explore} loading={busy} disabled={!live}>Find real hashtags</Btn>
      </div>
      {live && meta?.quotaNote && <p className="small faint" style={{ margin: "8px 4px 0" }}>{meta.quotaNote}</p>}

      {!live && (
        <Card className="mt">
          <Empty icon="plug" title={`${meta?.name} isn't connected yet`}>
            Real {meta?.name} hashtag data needs its official API. Instagram is live today — pick it above.
            {meta?.notes?.length > 0 && (
              <ul className="small muted" style={{ textAlign: "left", margin: "12px auto 0", maxWidth: 560, paddingLeft: 18 }}>
                {meta.notes.map((n) => <li key={n} style={{ marginBottom: 4 }}>{n}</li>)}
              </ul>
            )}
            <div className="small faint mt-s">Developer: add the API in <code>backend/services/hashtags/providers/{meta?.id}.js</code>{meta?.apiDocs && <> · <a className="sa-link" href={meta.apiDocs} target="_blank" rel="noreferrer">API docs</a></>}</div>
          </Empty>
        </Card>
      )}

      {/* seeds summary */}
      {live && data?.seeds?.length > 0 && (
        <div className="sa-seedcards mt">
          {data.seeds.map((s) => (
            <div key={s.hashtag} className="sa-seedcard">
              <div className="row between"><b className="tag">{s.hashtag}</b>{s.found ? <Pill tone="green">found</Pill> : <Pill tone={s.error ? "red" : "gray"}>{s.error ? "error" : "not found"}</Pill>}</div>
              {s.found ? (
                <div className="small muted mt-s">{s.topPosts} top posts · <b className="strong">{s.recentPosts24h}{s.recentPosts24h >= 50 ? "+" : ""}</b> recent posts<br />avg engagement on top posts: <b className="strong">{fmt(s.avgTopPostEngagement)}</b></div>
              ) : <div className="small muted mt-s">{s.error || s.note}</div>}
            </div>
          ))}
        </div>
      )}

      {live && (
        <div className="sa-grid g-main-r mt">
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            {/* hashtags table */}
            <Card>
              {!data ? (
                <Empty icon="hash" title={`Find hashtags real ${meta?.name} creators are using right now`}>
                  Type a few hashtags or keywords (e.g. <b>ghee, desi ghee</b>) and click <b>Find real hashtags</b>. You'll see every hashtag used in the top and latest posts, with their likes and comments.
                </Empty>
              ) : (
                <>
                  <Tabs value={tab} onChange={setTab} options={[
                    { value: "all", label: "All", count: data.hashtags?.length || 0 },
                    { value: "top", label: "In top posts", count: (data.hashtags || []).filter((h) => h.topPosts > 0).length },
                    { value: "recent", label: "Active recently", count: (data.hashtags || []).filter((h) => h.recentPosts24h > 0).length },
                    { value: "niche", label: "Niche" },
                  ]} />
                  <div className="sa-table-wrap">
                    <table className="sa-table">
                      <thead>
                        <tr>
                          <th />
                          <th>Hashtag</th>
                          {COLUMNS.map((c) => (
                            <th key={c.key} className="sa-th-sort" title={c.title} onClick={() => sortBy(c.key)}>
                              {c.label}{sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
                            </th>
                          ))}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((h) => {
                          const on = selected.has(h.hashtag);
                          return (
                            <tr key={h.hashtag} onClick={() => toggle(h.hashtag)} style={{ cursor: "pointer" }}>
                              <td><span className={cx("sa-check", on && "on")}>{on && <Icon name="check" size={14} stroke={3} />}</span></td>
                              <td>
                                <b style={{ color: "var(--sa-primary)" }}>{h.hashtag}</b>
                                {h.isSeed && <Pill tone="gray" style={{ marginLeft: 6 }}>seed</Pill>}
                                {h.similar?.length > 0 && <Pill tone="gray" style={{ marginLeft: 6 }} title={`Only used together in the same posts: ${h.similar.join(" ")}`}>+{h.similar.length} similar</Pill>}
                              </td>
                              <td><div className="row" style={{ minWidth: 110 }}><div className="sa-meter" style={{ height: 7 }}><span style={{ width: `${Math.round(((h.score || 0) / maxScore) * 100)}%`, background: "var(--sa-primary)" }} /></div><b className="strong">{h.score ?? "—"}</b></div></td>
                              <td className="num">{h.posts ?? "—"}</td>
                              <td className="num">{h.topPosts ?? "—"}</td>
                              <td className="num">{h.recentPosts24h ? <b className="green">{h.recentPosts24h}</b> : h.recentPosts24h ?? "—"}</td>
                              <td className="num">{fmt(h.avgLikes)}</td>
                              <td className="num">{fmt(h.avgComments)}</td>
                              <td>
                                <button type="button" className="sa-link" onClick={(e) => { e.stopPropagation(); showTagPosts(h.hashtag); }} title="Show the real posts using this hashtag">
                                  <Icon name="eye" size={15} />posts
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length && <p className="muted">Nothing in this tab yet.</p>}
                  <p className="small faint">Based on {data.mediaAnalyzed} real posts from {data.source || meta?.name} · fetched {timeAgo(data.fetchedAt)}. Numbers are from a sample of top + recent posts, not total hashtag volume.
                    {removedTotal > 0 && <> Only hashtags used in {data.removed.minPosts || 2}+ different posts are shown — {removedTotal} unrelated / spam hashtags removed.</>}</p>
                </>
              )}

              {/* selection bar */}
              <div className="row wrap mt" style={{ background: "#f7f6ff", border: "1px solid #ebe6fb", borderRadius: 16, padding: "12px 16px" }}>
                <Icon name="layers" style={{ color: "var(--sa-primary)" }} />
                <span className="grow">
                  <b className="strong">{sel.length} selected</b>{sel.length ? ": " : ""}<span className="small">{sel.join(" ")}</span>
                  {sel.length > MAX_TAGS_PER_POST && <span className="small red"> · Posts allow max {MAX_TAGS_PER_POST} hashtags</span>}
                </span>
                <Btn size="sm" onClick={() => setSelected(new Set())} disabled={!sel.length}>Clear</Btn>
                <Btn size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(sel.join(" ")); toast("Copied to clipboard", "success"); }} disabled={!sel.length}>Copy</Btn>
                <Btn size="sm" variant="primary" onClick={saveSet} disabled={!sel.length}>Save as set</Btn>
              </div>
            </Card>

            {/* real posts */}
            {data && (
              <Card id="hashtag-posts" title="Real posts behind these hashtags" sub="Click a hashtag on a post to add it to your selection."
                action={<Segmented value={postView} onChange={(v) => { setPostView(v); setShowPosts(12); }} options={[
                  { value: "top", label: "Top posts", count: data.topPosts?.length || 0 },
                  { value: "recent", label: "Recent", count: data.recentPosts?.length || 0 },
                ]} />}>
                {tagFilter && (
                  <div className="row mt-s" style={{ marginBottom: 12 }}>
                    <span className="small muted">Showing posts with</span><Pill tone="violet">{tagFilter}</Pill>
                    <button type="button" className="sa-link" onClick={() => setTagFilter("")}>show all</button>
                  </div>
                )}
                {posts.length ? (
                  <>
                    <div className="sa-igposts">
                      {posts.slice(0, showPosts).map((p) => <IgPostCard key={p.id} post={p} selected={selected} onTagClick={toggle} highlight={tagFilter} platformName={meta?.name} />)}
                    </div>
                    {posts.length > showPosts && <div className="row mt" style={{ justifyContent: "center" }}><Btn onClick={() => setShowPosts((n) => n + 12)}>Show more ({posts.length - showPosts})</Btn></div>}
                  </>
                ) : <p className="muted">No posts here.</p>}
                {platform === "instagram" && <p className="small faint mt-s" style={{ marginBottom: 0 }}>Meta's hashtag API does not share who posted. Use “Open on Instagram” to see the account, or look up a brand on the right.</p>}
              </Card>
            )}
          </div>

          {/* right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            {platform === "instagram" && (
              <Card title="Top brand / competitor hashtags" sub="Any Instagram Business or Creator account — their recent posts, engagement and hashtags.">
                <div className="row">
                  <input className="sa-input grow" placeholder="@username e.g. amul_india" value={compQ} onChange={(e) => setCompQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
                  <Btn variant="primary" icon="search" onClick={() => lookup()} loading={compBusy}>Look up</Btn>
                </div>
                {compHistory.length > 0 && (
                  <div className="row wrap mt-s" style={{ gap: 6 }}>
                    {compHistory.map((u) => <button key={u} type="button" className="sa-igtag" onClick={() => { setCompQ(u); lookup(u); }}>@{u}</button>)}
                  </div>
                )}
                {compBusy && <div className="row mt"><Spinner /> <span className="muted">Loading @{compQ.replace(/^@/, "")}…</span></div>}
                {comp && !compBusy && (
                  <div className="mt">
                    <div className="row">
                      {comp.profile.profilePictureUrl ? <img className="sa-profile-pic" src={comp.profile.profilePictureUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sa-profile-pic" />}
                      <div className="grow">
                        <b className="strong">@{comp.profile.username}</b>
                        <div className="small muted">{comp.profile.name}</div>
                      </div>
                      <a className="sa-link" href={`https://www.instagram.com/${comp.profile.username}/`} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={15} /></a>
                    </div>
                    <div className="sa-kv mt-s">
                      <div><span>Followers</span><b>{fmt(comp.profile.followers)}</b></div>
                      <div><span>Eng. rate</span><b>{comp.stats.engagementRate != null ? `${comp.stats.engagementRate}%` : "—"}</b></div>
                      <div><span>Posts / wk</span><b>{comp.stats.postsPerWeek}</b></div>
                    </div>
                    <div className="small muted mt-s">Avg per post: <b className="strong">{fmt(comp.stats.avgLikes)}</b> likes · <b className="strong">{fmt(comp.stats.avgComments)}</b> comments ({comp.stats.postsAnalyzed} posts)</div>
                    <h4 style={{ margin: "16px 0 8px" }}>Hashtags they use</h4>
                    {comp.stats.topHashtags.length ? (
                      <div className="sa-list">
                        {comp.stats.topHashtags.slice(0, 15).map((h) => (
                          <div key={h.hashtag} className="row between" style={{ padding: "7px 0", borderBottom: "1px solid #f0f1f6", cursor: "pointer" }} onClick={() => toggle(h.hashtag)}>
                            <span className="row" style={{ gap: 8 }}><span className={cx("sa-check", selected.has(h.hashtag) && "on")}>{selected.has(h.hashtag) && <Icon name="check" size={12} stroke={3} />}</span><b style={{ color: "var(--sa-primary)" }}>{h.hashtag}</b></span>
                            <span className="small muted">{h.posts} posts · avg {fmt(h.avgEngagement)} eng.</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="small muted">No hashtags in their recent captions.</p>}
                    {comp.stats.bestPost && (
                      <>
                        <h4 style={{ margin: "16px 0 8px" }}>Their best recent post</h4>
                        <IgPostCard post={comp.stats.bestPost} selected={selected} onTagClick={toggle} />
                      </>
                    )}
                  </div>
                )}
              </Card>
            )}

            <Card title="Saved sets">
              {sets.length ? (
                <div className="sa-chipset">
                  {sets.map((s, i) => (
                    <span key={s.name + i} className="sa-chip">
                      <button type="button" className="row" style={{ gap: 6, background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setSelected(new Set(s.tags))}><Icon name="folder" size={16} />{s.name} · {s.tags.length}</button>
                      <button type="button" className="sa-chip-x" onClick={() => deleteSet(i)} aria-label={`Delete ${s.name}`}><Icon name="x" size={14} /></button>
                    </span>
                  ))}
                </div>
              ) : <p className="small muted" style={{ margin: 0 }}>Select hashtags and click “Save as set” to reuse them in posts.</p>}
            </Card>

            {data?.limitations?.length > 0 && (
              <Card title="About this data">
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {data.limitations.map((l) => <li key={l} style={{ marginBottom: 6 }}>{l}</li>)}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
