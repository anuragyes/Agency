// Social accounts — Instagram, Facebook, and YouTube are LIVE; other channels are demo
import { useEffect, useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Btn, Card, DemoTag, LiveTag, Modal, PageHeader, Pill, Segmented, Spinner, Toggle, fmt, timeAgo, useToast } from "../ui/kit";
import IgPostCard from "../ui/IgPostCard";
import { Sparkline } from "../ui/charts";
import { ACCOUNTS } from "../mock";
import {
  API_BASE,
  getFacebookAccount,
  getInstagramAccount,
  getConnectedAccounts,
  disconnectAccount,
  getYoutubeAccount,
  connectYoutubeChannel,
  disconnectYoutubeChannel,
} from "../api";
import { useWorkspace } from "../store";

export default function SocialAccounts() {
  const toast = useToast();
  const { current } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [accts, setAccts] = useState(ACCOUNTS);
  const [ig, setIg] = useState({ state: "loading" });
  const [connect, setConnect] = useState(null);
  const [switchAccount, setSwitchAccount] = useState(false);
  const [fb, setFb] = useState({ state: "loading" });
  const [yt, setYt] = useState({ state: "loading" });
  const [ytChannelInput, setYtChannelInput] = useState("");
  const [connectingYt, setConnectingYt] = useState(false);
  const [oauthAccounts, setOauthAccounts] = useState([]);
  const [loadingOAuth, setLoadingOAuth] = useState(false);

  useEffect(() => {
    setSwitchAccount(false);
  }, [connect]);

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

  const handleRemoveAccount = async (account) => {
    const targetPlatform = account?.platform || connect?.key;
    const accountName = account?.name || account?.username || targetPlatform || "this account";
    if (!window.confirm(`Are you sure you want to remove and disconnect ${accountName}?`)) return;

    try {
      if (account?._id) {
        await disconnectAccount(account._id);
      }
      if (targetPlatform === "youtube") {
        try {
          await disconnectYoutubeChannel(current?._id);
        } catch (e) {
          console.warn("YouTube channel disconnect error:", e);
        }
      }
      toast(`Disconnected ${accountName} successfully`, "success");
      setConnect(null);
      await checkAll();
    } catch (err) {
      toast(`Failed to disconnect: ${err.message}`, "error");
    }
  };

  const handleDisconnect = async (id, name) => {
    const matchingAcc = oauthAccounts.find((o) => o._id === id);
    return handleRemoveAccount(matchingAcc || { _id: id, name });
  };

  const getConnectedListForPlatform = (key) => {
    if (!key || key === "pick") return [];
    const list = oauthAccounts.filter((o) => o.platform === key && o.status === "connected");
    if (list.length > 0) return list;
    if (key === "youtube" && (yt.state === "ok" || yt.data)) {
      return [{
        _id: yt.account?._id,
        platform: "youtube",
        name: yt.data?.profile?.name || yt.account?.name || "YouTube Channel",
        username: yt.data?.profile?.username || yt.account?.username || "",
        profilePictureUrl: yt.data?.profile?.profilePictureUrl || null,
        metadata: {
          subscribers: yt.data?.profile?.followers,
          videoCount: yt.data?.profile?.mediaCount,
          totalViews: yt.data?.profile?.totalViews,
        },
      }];
    }
    if (key === "instagram" && ig.state === "ok" && ig.data) {
      return [{
        platform: "instagram",
        name: ig.data?.profile?.name || (ig.user ? `@${ig.user}` : "Instagram Business"),
        username: ig.user || "",
        profilePictureUrl: ig.data?.profile?.profilePictureUrl || null,
        metadata: {
          followers: ig.data?.profile?.followers,
          mediaCount: ig.data?.profile?.mediaCount,
        },
      }];
    }
    if (key === "facebook" && fb.state === "ok" && fb.data) {
      return [{
        platform: "facebook",
        name: fb.data?.profile?.name || "Facebook Page",
        username: fb.data?.profile?.username || "",
        profilePictureUrl: fb.data?.profile?.profilePictureUrl || null,
        metadata: {
          followers: fb.data?.profile?.followers,
          pageLikes: fb.data?.profile?.pageLikes,
        },
      }];
    }
    return [];
  };

  // Handle returning from OAuth callback (?connected=meta or ?connected=youtube or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "meta") {
      toast("Successfully connected your Meta accounts!", "success");
      loadOauthAccounts();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get("connected") === "youtube") {
      const channel = params.get("channel");
      toast(channel ? `Successfully connected YouTube channel "${channel}" via Google OAuth!` : "Successfully connected YouTube channel via Google OAuth!", "success");
      loadOauthAccounts();
      checkYt();
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
  const checkYt = async () => {
    setYt({ state: "loading" });
    try {
      const r = await getYoutubeAccount(current?._id);
      if (r?.connected && r?.data) {
        setYt({ state: "ok", data: r.data, account: r.account });
      } else {
        setYt({ state: "idle", data: null });
      }
    } catch (e) {
      setYt({ state: "error", msg: e.message });
    }
  };
  const checkAll = () => { check(); checkFb(); checkYt(); loadOauthAccounts(); };
  useEffect(() => { checkAll(); }, [current?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectYoutube = async (e) => {
    e?.preventDefault?.();
    if (!ytChannelInput.trim()) {
      toast("Please enter your YouTube channel handle or URL", "error");
      return;
    }
    setConnectingYt(true);
    try {
      const r = await connectYoutubeChannel({
        channelQuery: ytChannelInput.trim(),
        productId: current?._id,
      });
      toast(r.message || "YouTube channel connected successfully!", "success");
      setConnect(null);
      setYtChannelInput("");
      checkYt();
      loadOauthAccounts();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setConnectingYt(false);
    }
  };

  const live = ig.data;
  const igStats = live?.stats;
  const fbLive = fb.data;
  const fbStats = fbLive?.stats;
  const ytLive = yt.data;
  const ytStats = ytLive?.stats;
  const liveOf = { instagram: ig, facebook: fb, youtube: yt };
  const ENV_HINT = {
    instagram: "Connect via Meta OAuth 2.0 or check backend credentials.",
    facebook: "Connect via Meta OAuth 2.0 or check backend credentials.",
    youtube: "Verify your channel handle or YOUTUBE_API_KEY in backend/.env.",
  };
  const view = accts.map((a) => {
    const oauthAcc = oauthAccounts.find((o) => o.platform === a.key && o.status === "connected");
    const L = liveOf[a.key];
    if (!L) return a;
    const d = L.data;
    const st = d?.stats;
    const oauthHandle = oauthAcc?.username ? (a.key === "instagram" ? `@${oauthAcc.username}` : a.key === "youtube" ? (oauthAcc.username.startsWith("@") ? oauthAcc.username : `@${oauthAcc.username}`) : oauthAcc.name || `@${oauthAcc.username}`) : null;
    const isConnected = L.state === "ok" || Boolean(oauthAcc && L.state !== "error");

    let displayHandle = a.handle;
    if (d) {
      if (a.key === "instagram") displayHandle = ig.user ? `@${ig.user}` : a.handle;
      else if (a.key === "facebook") displayHandle = d?.profile?.name || a.handle;
      else if (a.key === "youtube") displayHandle = d?.profile?.username ? (d.profile.username.startsWith("@") ? d.profile.username : `@${d.profile.username}`) : d?.profile?.name || a.handle;
    } else if (oauthHandle) {
      displayHandle = oauthHandle;
    }

    return {
      ...a,
      handle: displayHandle,
      status: isConnected ? "connected" : L.state === "error" ? "reconnect" : a.status,
      live: isConnected || L.state === "ok" || L.state === "error",
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

  const activeConnectedList = connect && connect !== "pick" ? getConnectedListForPlatform(connect.key) : [];
  const isAlreadyAuthenticated = activeConnectedList.length > 0;

  return (
    <>
      <PageHeader title="Social accounts" sub="Connect and manage every channel Sociva can publish to and listen on.">

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
            <div className="row between mt" style={{ borderTop: "1px solid var(--sa-border)", paddingTop: 10 }}>
              <button
                type="button"
                className="sa-link small muted"
                style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, padding: 0 }}
                onClick={() => setConnect(a)}
              >
                <Icon name="link" size={13} /> Manage / Remove Account
              </button>
            </div>
            {a.live && liveOf[a.key]?.state === "error" && <p className="small red" style={{ marginBottom: 0 }}>{liveOf[a.key].msg} {ENV_HINT[a.key]} <button type="button" className="sa-link" onClick={a.key === "facebook" ? checkFb : check}>Retry</button></p>}
            {!a.live && <div style={{ marginTop: 10 }}><DemoTag title="Stats are sample data until this channel's API is connected" /></div>}
          </div>
        ))}
      </div>



      <div className="sa-banner mt">
        <span className="sa-banner-ic"><Icon name="bulb" size={22} /></span>
        <div className="sa-banner-body"><h4>Your audience overlaps 64% with Threads users</h4><p>Connecting Threads could add ~12K reach per week with repurposed X content.</p></div>
        <Btn variant="primary" onClick={() => setConnect(ACCOUNTS.find((x) => x.key === "threads"))}>Connect Threads</Btn>
      </div>

      <Modal
        open={!!connect}
        onClose={() => setConnect(null)}
        title={
          connect === "pick"
            ? "Connect an account"
            : isAlreadyAuthenticated && !switchAccount
              ? `${connect?.name} — Connected Account`
              : `Connect ${connect?.name}`
        }
      >
        {connect === "pick" ? (
          <div className="sa-grid g-3" style={{ gap: 10 }}>
            {ACCOUNTS.map((a) => {
              const isConn = getConnectedListForPlatform(a.key).length > 0;
              return (
                <button
                  key={a.key}
                  type="button"
                  className="sa-goal"
                  style={{
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    position: "relative",
                  }}
                  onClick={() => setConnect(a)}
                >
                  {isConn && (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "#10b981",
                        color: "#fff",
                        borderRadius: "10px",
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}
                    >
                      <Icon name="check" size={10} /> Connected
                    </span>
                  )}
                  <PlatformIcon platform={a.key} size={40} />
                  <b style={{ fontSize: 13.5 }}>{a.name}</b>
                  <span className="small muted" style={{ fontSize: 11 }}>
                    {isConn ? "Manage / Remove" : "Connect"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : isAlreadyAuthenticated && !switchAccount ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(16, 185, 129, 0.08)",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.25)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#10b981",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check" size={18} />
              </span>
              <div>
                <b style={{ fontSize: 14, color: "#065f46" }}>Account is Authenticated & Active</b>
                <p className="small muted" style={{ margin: "2px 0 0", color: "#047857" }}>
                  Sociva is connected to your {connect?.name} account. 1-click video publishing, thumbnail uploads, and analytics sync are fully active.
                </p>
              </div>
            </div>

            {activeConnectedList.map((acc, idx) => {
              const displayName = acc.name || acc.username || `${connect?.name} Channel`;
              const displayHandle = acc.username
                ? acc.username.startsWith("@")
                  ? acc.username
                  : `@${acc.username}`
                : acc.accountId
                  ? `ID: ${acc.accountId}`
                  : null;
              const followers = acc.metadata?.subscribers || acc.metadata?.followers;
              const extraStats =
                acc.metadata?.videoCount != null
                  ? `${fmt(acc.metadata.videoCount)} videos`
                  : acc.metadata?.mediaCount != null
                    ? `${fmt(acc.metadata.mediaCount)} posts`
                    : null;

              return (
                <div
                  key={acc._id || idx}
                  style={{
                    padding: "16px",
                    background: "var(--sa-bg)",
                    borderRadius: 14,
                    border: "1px solid var(--sa-border)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div className="row between wrap" style={{ gap: 12, alignItems: "center" }}>
                    <div className="row" style={{ gap: 12, alignItems: "center" }}>
                      {acc.profilePictureUrl ? (
                        <img
                          src={acc.profilePictureUrl}
                          alt=""
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            objectFit: "cover",
                            border: "2px solid #10b981",
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <PlatformIcon platform={connect?.key} size={50} radius={14} />
                      )}
                      <div>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <b className="strong" style={{ fontSize: 16 }}>
                            {displayName}
                          </b>
                          <Pill tone="green" icon="checkCircle">
                            Connected
                          </Pill>
                        </div>
                        {displayHandle && <div className="small muted">{displayHandle}</div>}
                        {acc.parentAccountName && (
                          <div className="small faint">via Facebook Page: {acc.parentAccountName}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {(followers != null || extraStats || acc.tokenExpiresAt) && (
                    <div
                      className="row wrap"
                      style={{
                        gap: 8,
                        padding: "8px 12px",
                        background: "rgba(0, 0, 0, 0.03)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    >
                      {followers != null && (
                        <span style={{ fontWeight: 600 }}>
                          {fmt(followers)} {connect?.key === "youtube" ? "subscribers" : "followers"}
                        </span>
                      )}
                      {extraStats && <span className="muted">· {extraStats}</span>}
                      {acc.tokenExpiresAt && (
                        <span className="muted">
                          · Token active until {new Date(acc.tokenExpiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className="row between wrap"
                    style={{
                      gap: 10,
                      paddingTop: 12,
                      borderTop: "1px solid var(--sa-border)",
                      alignItems: "center",
                    }}
                  >
                    <Btn
                      variant="outline"
                      style={{
                        color: "var(--sa-red, #ef4444)",
                        borderColor: "rgba(239, 68, 68, 0.4)",
                        background: "rgba(239, 68, 68, 0.05)",
                        fontWeight: 600,
                      }}
                      icon="trash"
                      onClick={() => handleRemoveAccount(acc)}
                    >
                      Remove / Disconnect Account
                    </Btn>

                    <button
                      type="button"
                      className="sa-link small faint"
                      onClick={() => setSwitchAccount(true)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Switch / Reconnect Account
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => setConnect(null)}>
                Done
              </Btn>
            </div>
          </div>
        ) : connect?.key === "youtube" ? (
          <div style={{ display: "grid", gap: 16 }}>
            {switchAccount && (
              <div className="row between" style={{ marginBottom: -6 }}>
                <button
                  type="button"
                  className="sa-link small"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setSwitchAccount(false)}
                >
                  ← Back to connected account
                </button>
              </div>
            )}
            {/* OAuth Option 1: Official Google OAuth (Required for Publishing) */}
            <div style={{ padding: "16px 18px", background: "var(--sa-bg)", borderRadius: 14, border: "1.5px solid #ef4444" }}>
              <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 8 }}>
                <PlatformIcon platform="youtube" size={32} />
                <div>
                  <b style={{ fontSize: 15 }}>Connect with Google OAuth (Recommended)</b>
                  <span style={{ display: "block", fontSize: 11.5, color: "#10b981", fontWeight: 600 }}>Enables 1-Click Video Publishing & Thumbnails</span>
                </div>
              </div>
              <p className="small muted" style={{ margin: "0 0 12px", lineHeight: 1.4 }}>
                Authorizes Sociva to upload your finished videos, attach custom AI thumbnails, and publish directly to your YouTube channel without manual work.
              </p>
              <a
                href={`${API_BASE}/api/auth/youtube/connect?productId=${current?._id || ""}&token=${encodeURIComponent(localStorage.getItem("sociva_token") || "")}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "11px 18px",
                  borderRadius: 10,
                  background: "#FF0000",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13.5,
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(255,0,0,0.25)",
                }}
              >
                <Icon name="sparkles" size={16} /> Connect YouTube Channel (OAuth 2.0)
              </a>
            </div>

            <div style={{ textAlign: "center", position: "relative", margin: "2px 0" }}>
              <span style={{ background: "#fff", padding: "0 10px", fontSize: 11.5, color: "#94a3b8", fontWeight: 600 }}>
                OR TRACK PUBLIC CHANNEL METRICS ONLY
              </span>
            </div>

            {/* Option 2: Public Channel Handle Verification */}
            <form onSubmit={handleConnectYoutube} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="strong" style={{ fontSize: 13 }}>
                  Channel Handle, URL or Channel ID
                </label>
                <input
                  type="text"
                  className="sa-input"
                  value={ytChannelInput}
                  onChange={(e) => setYtChannelInput(e.target.value)}
                  placeholder="e.g. @mkbhd, @mrbeast, or youtube.com/@yourchannel"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14 }}
                />
                <p className="small faint" style={{ margin: 0 }}>
                  Syncs public metrics and videos via YouTube API key (read-only; publishing videos requires Google OAuth above).
                </p>
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <Btn variant="outline" type="button" onClick={() => setConnect(null)}>
                  Cancel
                </Btn>
                <Btn
                  variant="outline"
                  type="submit"
                  loading={connectingYt}
                  icon="check"
                >
                  Track Channel
                </Btn>
              </div>
            </form>
          </div>
        ) : (connect?.key === "facebook" || connect?.key === "instagram") ? (
          <div style={{ display: "grid", gap: 16 }}>
            {switchAccount && (
              <div className="row between" style={{ marginBottom: -6 }}>
                <button
                  type="button"
                  className="sa-link small"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setSwitchAccount(false)}
                >
                  ← Back to connected account
                </button>
              </div>
            )}
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
          <div className="sa-empty" style={{ padding: 10 }}>
            {switchAccount && (
              <div className="row between" style={{ marginBottom: 12, width: "100%" }}>
                <button
                  type="button"
                  className="sa-link small"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setSwitchAccount(false)}
                >
                  ← Back to connected account
                </button>
              </div>
            )}
            <PlatformIcon platform={connect?.key} size={52} />
            <h4>OAuth for {connect?.name} is coming soon</h4>
            <p>The backend supports Instagram, Facebook, and YouTube today. We'll notify you when {connect?.name} publishing is ready.</p>
            <Btn onClick={() => { toast(`We'll let you know when ${connect?.name} is ready`, "success"); setConnect(null); }}>Notify me</Btn>
          </div>
        )}
      </Modal>
    </>
  );
}
