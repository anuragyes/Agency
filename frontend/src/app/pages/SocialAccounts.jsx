// Social accounts — Instagram + Facebook are LIVE (GET /api/instagram/account, GET /api/facebook/account: real followers, engagement, posts); other channels are demo
import { useEffect, useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Btn, Card, DemoTag, LiveTag, Modal, PageHeader, Pill, Segmented, Spinner, Toggle, fmt, timeAgo, useToast } from "../ui/kit";
import IgPostCard from "../ui/IgPostCard";
import { Sparkline } from "../ui/charts";
import { ACCOUNTS } from "../mock";
import { API_BASE, getFacebookAccount, getInstagramAccount, getConnectedAccounts, disconnectAccount } from "../api";
import { useWorkspace } from "../store";

export default function SocialAccounts() {
  const toast = useToast();
  const { current } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [accts, setAccts] = useState(ACCOUNTS);
  const [ig, setIg] = useState({ state: "loading" });
  const [connect, setConnect] = useState(null);
  const [fb, setFb] = useState({ state: "loading" });
  const [oauthAccounts, setOauthAccounts] = useState([]);
  const [loadingOAuth, setLoadingOAuth] = useState(false);

  const loadOauthAccounts = async () => {
    setLoadingOAuth(true);
    try {
      const res = await getConnectedAccounts(current?._id);
      setOauthAccounts(res.data || []);
    } catch (err) {
      console.error("Failed to load connected accounts:", err);
    } finally {
      setLoadingOAuth(false);
    }
  };

  const handleDisconnect = async (id, name) => {
    if (!window.confirm(`Are you sure you want to disconnect ${name || "this account"}?`)) return;
    try {
      await disconnectAccount(id);
      toast(`Disconnected ${name || "account"} successfully`, "success");
      loadOauthAccounts();
    } catch (err) {
      toast(`Failed to disconnect: ${err.message}`, "error");
    }
  };

  // Handle returning from OAuth callback (?connected=meta or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "meta") {
      toast("Successfully connected your Meta accounts!", "success");
      loadOauthAccounts();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get("error")) {
      const raw = params.get("error");
      const cleanMsg = raw === "no_facebook_pages_found"
        ? "No Facebook Page found. Please make sure your Instagram account is linked to a Facebook Page, or select your Page during Facebook login."
        : raw;
      toast(`OAuth connection: ${cleanMsg}`, "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast]);

  const check = async () => {
    setIg({ state: "loading" });
    try {
      const r = await getInstagramAccount(current?._id);
      setIg({ state: "ok", user: r.data.profile.username, id: r.data.profile.id, data: r.data });
    } catch (e) {
      setIg({ state: "error", msg: e.message });
    }
  };
  const checkFb = async () => {
    setFb({ state: "loading" });
    try {
      const r = await getFacebookAccount(current?._id);
      setFb({ state: "ok", data: r.data });
    } catch (e) {
      setFb({ state: "error", msg: e.message });
    }
  };
  const checkAll = () => { check(); checkFb(); loadOauthAccounts(); };
  useEffect(() => { checkAll(); }, [current?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = ig.data;
  const igStats = live?.stats;
  const fbLive = fb.data;
  const fbStats = fbLive?.stats;
  const liveOf = { instagram: ig, facebook: fb };
  const ENV_HINT = { instagram: "Connect via Meta OAuth 2.0 or check backend credentials.", facebook: "Connect via Meta OAuth 2.0 or check backend credentials." };
  const view = accts.map((a) => {
    const oauthAcc = oauthAccounts.find((o) => o.platform === a.key && o.status === "connected");
    const L = liveOf[a.key];
    if (!L) return a;
    const d = L.data;
    const st = d?.stats;
    const oauthHandle = oauthAcc?.username ? (a.key === "instagram" ? `@${oauthAcc.username}` : oauthAcc.name || `@${oauthAcc.username}`) : null;
    const isConnected = L.state === "ok" || Boolean(oauthAcc && L.state !== "error");

    return {
      ...a,
      handle: d ? (a.key === "instagram" ? (ig.user ? `@${ig.user}` : a.handle) : d?.profile?.name || a.handle) : (oauthHandle || a.handle),
      status: isConnected ? "connected" : L.state === "error" ? "reconnect" : a.status,
      live: true,
      // real numbers when the API answered, "—" while loading / on error (never demo numbers)
      followers: d ? fmt(d.profile.followers) : "—",
      eng: st?.engagementRate != null ? `${st.engagementRate}%` : "—",
      ppw: st ? st.postsPerWeek : "—",
      spark: st?.engagementTrend?.length > 1 ? st.engagementTrend : a.spark,
    };
  });
  const counts = { all: view.length, connected: view.filter((a) => a.status === "connected").length, attention: view.filter((a) => a.status === "reconnect").length, available: view.filter((a) => a.status === "available").length };
  const shown = view.filter((a) => filter === "all" || (filter === "connected" && a.status === "connected") || (filter === "attention" && a.status === "reconnect") || (filter === "available" && a.status === "available"));
  const setAuto = (key, v) => setAccts((l) => l.map((a) => (a.key === key ? { ...a, autopilot: v } : a)));

  return (
    <>
      <PageHeader title="Social accounts" sub="Connect and manage every channel Sociva can publish to and listen on.">
        <Btn icon="refresh" onClick={() => { checkAll(); toast("Syncing all channels…"); }}>Sync all</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setConnect("pick")}>Connect account</Btn>
      </PageHeader>

      <div className="sa-grid g-4">
        <div className="sa-card sa-stat"><div className="sa-stat-top"><span className="sa-ic tone-violet"><Icon name="link" size={18} /></span>Connected channels</div><div className="sa-stat-value mt-s">{counts.connected}<span className="muted" style={{ fontSize: 18 }}> /10</span></div><div className="sa-meter mt-s" style={{ height: 6 }}><span style={{ width: `${counts.connected * 10}%`, background: "var(--sa-primary)" }} /></div></div>
        <div className="sa-card sa-stat"><div className="sa-stat-top"><span className="sa-ic tone-green"><Icon name="users" size={18} /></span>Instagram followers</div><div className="sa-stat-value mt-s">{live ? Number(live.profile.followers || 0).toLocaleString() : "—"}</div><div className="small muted mt-s">{live ? <>following {fmt(live.profile.following)} · {fmt(live.profile.mediaCount)} posts</> : ig.state === "loading" ? "Loading…" : "Not available"}</div></div>
        <div className="sa-card sa-stat"><div className="sa-stat-top"><span className="sa-ic tone-blue"><Icon name="heart" size={18} /></span>Instagram engagement</div><div className="sa-stat-value mt-s">{igStats?.engagementRate != null ? `${igStats.engagementRate}%` : "—"}</div><div className="small muted mt-s">{igStats ? <>avg {fmt(igStats.avgLikes)} likes · {fmt(igStats.avgComments)} comments / post</> : ig.state === "error" ? "Instagram token needs attention" : "Loading…"}</div></div>
        <div className="sa-card sa-stat"><div className="sa-stat-top"><span className="sa-ic tone-amber"><Icon name="bot" size={18} /></span>On autopilot</div><div className="sa-stat-value mt-s">{view.filter((a) => a.autopilot).length} channels</div><div className="small muted mt-s">{view.filter((a) => a.status === "connected" && !a.autopilot).length} in approval mode</div></div>
      </div>

      <div className="row between wrap mt">
        <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: `All (${counts.all})` }, { value: "connected", label: `Connected (${counts.connected})` }, { value: "attention", label: `Needs attention (${counts.attention})` }, { value: "available", label: `Available (${counts.available})` }]} />
        <Segmented value={layout} onChange={setLayout} options={[{ value: "grid", label: "Grid", icon: "grid" }, { value: "list", label: "List", icon: "list" }]} />
      </div>

      <div className={`sa-grid ${layout === "grid" ? "g-3" : ""} mt`}>
        {shown.map((a) => a.status === "available" ? (
          <div key={a.key} className="sa-card" style={{ borderStyle: "dashed", boxShadow: "none" }}>
            <div className="row"><PlatformIcon platform={a.key} size={50} radius={14} /><div><b className="strong" style={{ fontSize: 17 }}>{a.name}</b><div className="small muted">Not connected</div></div></div>
            <p className="muted">Publish, schedule and track analytics for {a.name}.</p>
            <Btn className="sa-btn-block" icon="plus" onClick={() => setConnect(a)}>Connect</Btn>
          </div>
        ) : (
          <div key={a.key} className="sa-card">
            <div className="row between">
              <div className="row"><PlatformIcon platform={a.key} size={50} radius={14} /><div><b className="strong" style={{ fontSize: 17 }}>{a.name}</b><div className="small muted">{a.handle}</div></div></div>
              {a.live && liveOf[a.key]?.state === "loading" ? <Spinner /> : a.status === "connected" ? <Pill tone="green" icon="checkCircle">{a.live ? "Live API" : "Connected"}</Pill> : <Pill tone="amber" icon="clock">Reconnect</Pill>}
            </div>
            <div className="sa-kv mt">
              <div><span>Followers</span><b>{a.followers}</b></div>
              <div><span>Eng. rate</span><b>{a.eng}</b></div>
              <div><span>Posts / wk</span><b>{a.ppw}</b></div>
            </div>
            <div className="row between mt">
              <span className="row"><Toggle checked={a.autopilot} onChange={(v) => setAuto(a.key, v)} label={`${a.name} autopilot`} /><b className="strong">{a.autopilot ? "Autopilot" : "Approval mode"}</b></span>
              <Sparkline data={a.spark} color={a.status === "reconnect" ? "#f59e0b" : "#10b981"} width={150} height={40} />
            </div>
            {a.live && liveOf[a.key]?.state === "error" && <p className="small red" style={{ marginBottom: 0 }}>{liveOf[a.key].msg} {ENV_HINT[a.key]} <button type="button" className="sa-link" onClick={a.key === "facebook" ? checkFb : check}>Retry</button></p>}
            {!a.live && <div style={{ marginTop: 10 }}><DemoTag title="Stats are sample data until this channel's API is connected" /></div>}
          </div>
        ))}
      </div>

      {oauthAccounts.length > 0 && (
        <Card
          className="mt"
          title={
            <span className="row" style={{ gap: 10, alignItems: "center" }}>
              Connected Accounts <LiveTag>Meta OAuth 2.0</LiveTag>
            </span>
          }
          sub="Accounts authenticated via Meta Login for Business with 60-day auto-refreshing access tokens."
          action={
            <Btn size="sm" icon="refresh" onClick={loadOauthAccounts}>
              Refresh
            </Btn>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {oauthAccounts.map((acc) => (
              <div
                key={acc._id}
                className="row between wrap"
                style={{
                  padding: "12px 16px",
                  background: "var(--sa-bg)",
                  borderRadius: 12,
                  border: "1px solid var(--sa-border)",
                  alignItems: "center",
                }}
              >
                <div className="row" style={{ gap: 12, alignItems: "center" }}>
                  {acc.profilePictureUrl ? (
                    <img
                      src={acc.profilePictureUrl}
                      alt=""
                      style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover" }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <PlatformIcon platform={acc.platform} size={44} radius={12} />
                  )}
                  <div>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <b className="strong" style={{ fontSize: 16 }}>
                        {acc.name || acc.username || acc.accountId}
                      </b>
                      <Pill tone="green" icon="checkCircle">
                        OAuth Active
                      </Pill>
                    </div>
                    <div className="small muted">
                      {acc.platform === "instagram" ? `@${acc.username}` : `Facebook Page ID: ${acc.accountId}`}
                      {acc.parentAccountName ? ` · via Page "${acc.parentAccountName}"` : ""}
                      {acc.tokenExpiresAt ? ` · Token valid until ${new Date(acc.tokenExpiresAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <Btn
                    size="sm"
                    variant="outline"
                    style={{ color: "var(--sa-red, #ef4444)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                    onClick={() => handleDisconnect(acc._id, acc.name || acc.username)}
                  >
                    Disconnect
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {live && (
        <Card className="mt" title={<span className="row" style={{ gap: 10 }}>Instagram — live overview <LiveTag>Graph API</LiveTag></span>}
          sub={`Real data from your connected account · updated ${timeAgo(live.fetchedAt)}`}
          action={<Btn size="sm" icon="refresh" onClick={check}>Refresh</Btn>}>
          <div className="row">
            {live.profile.profilePictureUrl ? <img className="sa-profile-pic" src={live.profile.profilePictureUrl} alt="" referrerPolicy="no-referrer" /> : <PlatformIcon platform="instagram" size={52} radius={26} />}
            <div className="grow">
              <b className="strong" style={{ fontSize: 17 }}>@{live.profile.username}</b> {live.profile.accountType && <Pill tone="gray">{live.profile.accountType}</Pill>}
              <div className="small muted">{live.profile.name}{live.profile.biography ? ` · ${live.profile.biography}` : ""}</div>
            </div>
            <a className="sa-link" href={`https://www.instagram.com/${live.profile.username}/`} target="_blank" rel="noreferrer">Open profile <Icon name="arrowUpRight" size={14} /></a>
          </div>
          <div className="sa-grid g-6 mt">
            {[
              ["Followers", fmt(live.profile.followers)],
              ["Following", fmt(live.profile.following)],
              ["Posts", fmt(live.profile.mediaCount)],
              ["Avg likes", fmt(igStats.avgLikes)],
              ["Avg comments", fmt(igStats.avgComments)],
              ["Eng. rate", igStats.engagementRate != null ? `${igStats.engagementRate}%` : "—"],
            ].map(([k, v]) => <div key={k} className="sa-kv" style={{ gridTemplateColumns: "1fr" }}><div><span>{k}</span><b>{v}</b></div></div>)}
          </div>
          <p className="small faint">Engagement rate = average (likes + comments) per post ÷ followers, from your last {igStats.postsAnalyzed} posts.</p>
          {live.errors?.media && <p className="small red">Posts could not be loaded: {live.errors.media}</p>}

          {igStats.topHashtags.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Hashtags you use (and how those posts performed)</h4>
              <div className="row wrap" style={{ gap: 8 }}>
                {igStats.topHashtags.slice(0, 20).map((h) => (
                  <span key={h.hashtag} className="sa-igtag" title={`${h.posts} posts · avg ${h.avgEngagement ?? "—"} likes+comments`}>{h.hashtag} <span className="faint">· {h.posts} · {fmt(h.avgEngagement)}</span></span>
                ))}
              </div>
            </>
          )}

          {live.recentPosts.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Recent posts</h4>
              <div className="sa-igposts">
                {live.recentPosts.slice(0, 8).map((p) => <IgPostCard key={p.id} post={p} />)}
              </div>
            </>
          )}
        </Card>
      )}


      {fbLive && (
        <Card className="mt" title={<span className="row" style={{ gap: 10 }}>Facebook Page — live overview <LiveTag>Graph API</LiveTag></span>}
          sub={`Real data from your connected Page · updated ${timeAgo(fbLive.fetchedAt)}`}
          action={<Btn size="sm" icon="refresh" onClick={checkFb}>Refresh</Btn>}>
          <div className="row">
            {fbLive.profile.profilePictureUrl ? <img className="sa-profile-pic" src={fbLive.profile.profilePictureUrl} alt="" referrerPolicy="no-referrer" /> : <PlatformIcon platform="facebook" size={52} radius={26} />}
            <div className="grow">
              <b className="strong" style={{ fontSize: 17 }}>{fbLive.profile.name}</b> {fbLive.profile.category && <Pill tone="gray">{fbLive.profile.category}</Pill>}
              <div className="small muted">{fbLive.profile.biography || (fbLive.profile.username ? `@${fbLive.profile.username}` : "")}</div>
            </div>
            {fbLive.profile.link && <a className="sa-link" href={fbLive.profile.link} target="_blank" rel="noreferrer">Open Page <Icon name="arrowUpRight" size={14} /></a>}
          </div>
          <div className="sa-grid g-6 mt">
            {[
              ["Followers", fmt(fbLive.profile.followers)],
              ["Page likes", fmt(fbLive.profile.pageLikes)],
              ["Avg reactions", fmt(fbStats.avgLikes)],
              ["Avg comments", fmt(fbStats.avgComments)],
              ["Avg shares", fmt(fbStats.avgShares)],
              ["Eng. rate", fbStats.engagementRate != null ? `${fbStats.engagementRate}%` : "—"],
            ].map(([k, v]) => <div key={k} className="sa-kv" style={{ gridTemplateColumns: "1fr" }}><div><span>{k}</span><b>{v}</b></div></div>)}
          </div>
          <p className="small faint">Engagement rate = average (reactions + comments + shares) per post ÷ followers, from your last {fbStats.postsAnalyzed} posts · {fbStats.postsPerWeek} posts / week.</p>
          {fbLive.errors?.media && <p className="small red">Posts could not be loaded: {fbLive.errors.media}</p>}

          {fbStats.topHashtags?.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Hashtags your Page uses (and how those posts performed)</h4>
              <div className="row wrap" style={{ gap: 8 }}>
                {fbStats.topHashtags.slice(0, 20).map((h) => (
                  <span key={h.hashtag} className="sa-igtag" title={`${h.posts} posts · avg ${h.avgEngagement ?? "—"} reactions+comments+shares`}>{h.hashtag} <span className="faint">· {h.posts} · {fmt(h.avgEngagement)}</span></span>
                ))}
              </div>
            </>
          )}

          {fbLive.recentPosts.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Recent posts</h4>
              <div className="sa-igposts">
                {fbLive.recentPosts.slice(0, 8).map((p) => <IgPostCard key={p.id} post={p} platformName="Facebook" />)}
              </div>
            </>
          )}
        </Card>
      )}
      <div className="sa-banner mt">
        <span className="sa-banner-ic"><Icon name="bulb" size={22} /></span>
        <div className="sa-banner-body"><h4>Your audience overlaps 64% with Threads users</h4><p>Connecting Threads could add ~12K reach per week with repurposed X content.</p></div>
        <Btn variant="primary" onClick={() => setConnect(ACCOUNTS.find((x) => x.key === "threads"))}>Connect Threads</Btn>
      </div>

      <Modal open={!!connect} onClose={() => setConnect(null)} title={connect === "pick" ? "Connect an account" : `Connect ${connect?.name}`}>
        {connect === "pick" ? (
          <div className="sa-grid g-3" style={{ gap: 10 }}>
            {ACCOUNTS.map((a) => <button key={a.key} type="button" className="sa-goal" style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }} onClick={() => setConnect(a)}><PlatformIcon platform={a.key} size={40} /><b style={{ fontSize: 13.5 }}>{a.name}</b></button>)}
          </div>
        ) : (connect?.key === "facebook" || connect?.key === "instagram") ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="row" style={{ gap: 14, alignItems: "center", padding: "14px 16px", background: "var(--sa-bg)", borderRadius: 14, border: "1px solid var(--sa-border)" }}>
              <PlatformIcon platform={connect?.key} size={44} />
              <div>
                <b style={{ fontSize: 16 }}>Connect with Meta Login (OAuth 2.0)</b>
                <p className="small muted" style={{ margin: "2px 0 0" }}>
                  Log in to your Meta account to connect your {connect?.name} Business profile for auto-publishing, insights, and inbox management.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <a
                href={`${API_BASE}/api/auth/meta/connect?productId=${current?._id || ""}&token=${encodeURIComponent(localStorage.getItem("sociva_token") || "")}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "12px 20px",
                  borderRadius: 12,
                  background: "#1877F2",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <Icon name="link" size={18} />
                Continue with Meta / Facebook
              </a>

              <div style={{ textAlign: "center", margin: "4px 0" }}>
                <span className="small muted">or</span>
              </div>

              <Btn
                variant="outline"
                icon="plug"
                onClick={() => {
                  (connect.key === "facebook" ? checkFb : check)();
                  setConnect(null);
                }}
              >
                Test Local Token (.env)
              </Btn>
            </div>
            <p className="small muted" style={{ margin: 0, fontSize: 11, textAlign: "center" }}>
              Uses secure Meta OAuth 2.0 with 60-day auto-refreshing long-lived tokens.
            </p>
          </div>
        ) : (
          <div className="sa-empty" style={{ padding: 10 }}><PlatformIcon platform={connect?.key} size={52} /><h4>OAuth for {connect?.name} is coming soon</h4><p>The backend supports Instagram and Facebook today. We'll notify you when {connect?.name} publishing is ready.</p><Btn onClick={() => { toast(`We'll let you know when ${connect?.name} is ready`, "success"); setConnect(null); }}>Notify me</Btn></div>
        )}
      </Modal>
    </>
  );
}
