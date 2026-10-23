// Settings — profile, Brand Brain (LIVE product profile), Autopilot guardrails, team, integrations, billing
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../ui/Icon";
import { Avatar, Btn, Card, Field, Pill, Spinner, Toggle, cx, timeAgo, useToast } from "../ui/kit";
import { Meter } from "../ui/charts";
import { useWorkspace } from "../store";
import { API_BASE, pingBackend, testInstagram } from "../api";
import { readBrand } from "../brand";
import { TEAM } from "../mock";

const MENU = [
  { sec: "Account", items: [["profile", "user", "Profile"], ["notifications", "bell", "Notifications"], ["security", "shield", "Security"]] },
  { sec: "Workspace", items: [["general", "building", "General"], ["team", "users", "Team & roles"], ["brand", "brain", "Brand Brain"], ["autopilot", "bot", "Autopilot rules"], ["integrations", "plug", "Integrations"], ["billing", "card", "Billing & plan"], ["api", "key", "API keys"]] },
];

function Guardrails() {
  const [g, setG] = useState({ publish: true, reply: true, approval: true, boost: false });
  const rows = [
    ["publish", "send", "violet", "Auto-publish scheduled posts", "Posts with a score above 85 publish without approval"],
    ["reply", "message", "green", "Auto-reply to comments & DMs", "Escalate negative sentiment, pricing and demo requests"],
    ["approval", "shield", "amber", "Require approval for client accounts", "Applies to every client workspace"],
    ["boost", "flag", "red", "Allow paid boosting", "AI can boost top posts up to a daily budget"],
  ];
  return (
    <>
      <h3 style={{ fontSize: 19 }}>Autopilot guardrails</h3>
      <p className="muted" style={{ margin: "4px 0 16px" }}>Control what AI agents can do without asking you first.</p>
      {rows.map(([k, ic, tone, t, s]) => (
        <div key={k} className="row" style={{ padding: "12px 0" }}>
          <span className={`sa-ic lg tone-${tone}`}><Icon name={ic} size={20} /></span>
          <div className="grow"><b className="strong">{t}</b><div className="small muted">{s}</div></div>
          <Toggle checked={g[k]} onChange={(v) => setG({ ...g, [k]: v })} label={t} />
        </div>
      ))}
    </>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "profile";
  const toast = useToast();
  const { current, products, online, selectProduct } = useWorkspace();
  const [name, setName] = useState("Sarah Johnson");
  const [title, setTitle] = useState("Head of Growth");
  const [tz, setTz] = useState("(GMT+5:30) Asia/Kolkata");
  const [ig, setIg] = useState({ state: "idle" });
  const [api, setApi] = useState(null);
  const brand = readBrand(current?._id);
  const p = current?.aiProfile;

  useEffect(() => { pingBackend().then(setApi); }, []);
  const checkIg = async () => {
    setIg({ state: "loading" });
    try { const d = await testInstagram(); setIg({ state: "ok", user: d?.username }); } catch (e) { setIg({ state: "error", msg: e.message }); }
  };
  useEffect(() => { if (tab === "integrations") checkIg(); }, [tab]);

  return (
    <>
      <div className="sa-page-head"><div><h1>Settings</h1><p>Manage your profile, workspace, team, Autopilot guardrails and billing.</p></div></div>
      <div className="sa-grid g-settings">
        <Card style={{ padding: 14 }}>
          {MENU.map((s) => (
            <div key={s.sec} className="sa-nav">
              <div className="sa-nav-sec">{s.sec.toUpperCase()}</div>
              {s.items.map(([k, ic, l]) => (
                <a key={k} href={`?tab=${k}`} className={cx(tab === k && "active")} onClick={(e) => { e.preventDefault(); setParams({ tab: k }); }}><Icon name={ic} size={18} />{l}</a>
              ))}
            </div>
          ))}
        </Card>

        <Card>
          {(tab === "profile" || tab === "general" || tab === "notifications" || tab === "security") && (
            <>
              <h3 style={{ fontSize: 19 }}>Profile</h3>
              <p className="muted" style={{ margin: "4px 0 20px" }}>This information is visible to your team and clients.</p>
              <div className="row wrap" style={{ gap: 18 }}>
                <Avatar name={name} size={92} />
                <div className="grow"><b className="strong" style={{ fontSize: 18 }}>{name}</b><div className="muted">Admin · Joined March 2025</div></div>
                <Btn icon="upload">Upload photo</Btn><Btn variant="ghost" className="sa-btn-danger">Remove</Btn>
              </div>
              <div className="sa-grid g-2 mt">
                <Field label="Full name"><input className="sa-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Email"><div className="sa-input-ic"><Icon name="mail" /><input className="sa-input" defaultValue="sarah@northbeam.studio" /></div></Field>
                <Field label="Role / title"><input className="sa-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Time zone"><select className="sa-select" value={tz} onChange={(e) => setTz(e.target.value)}><option>(GMT+5:30) Asia/Kolkata</option><option>(GMT+0) London</option><option>(GMT-5) New York</option><option>(GMT-8) Los Angeles</option></select></Field>
              </div>
              <div className="row mt"><Btn variant="primary" onClick={() => toast("Profile saved", "success")}>Save changes</Btn><span className="small muted">Account storage isn't wired to the backend yet — changes stay in this session.</span></div>
              <hr className="sa-hr" />
              <Guardrails />
            </>
          )}

          {tab === "autopilot" && <Guardrails />}

          {tab === "team" && (
            <>
              <div className="row between"><div><h3 style={{ fontSize: 19 }}>Team members</h3><span className="muted">{TEAM.length} of 10 seats used</span></div><Btn variant="primary" icon="userPlus" onClick={() => toast("Invite sent (demo)", "success")}>Invite member</Btn></div>
              <div className="sa-list mt">
                {TEAM.map((m) => (
                  <div key={m.email} className="sa-li"><Avatar name={m.name} size={42} /><span className="grow"><b>{m.name}</b><small>{m.email}</small></span><Pill tone={m.role[0]}>{m.role[1]}</Pill><span className="muted small" style={{ width: 60 }}>Active</span><Icon name="more" className="faint" /></div>
                ))}
              </div>
            </>
          )}

          {tab === "brand" && (
            <>
              <div className="row between"><div><h3 style={{ fontSize: 19 }}>Brand Brain</h3><span className="muted">What the Product AI Agent learned — used by every content agent.</span></div><Btn variant="primary" icon="pen" to="/onboarding?step=1">Fine-tune</Btn></div>
              {!p ? <p className="muted mt">No brand yet. <Link className="sa-link" to="/onboarding">Train your Brand Brain</Link></p> : (
                <div className="mt" style={{ display: "grid", gap: 16 }}>
                  <div className="row"><Avatar name={p.name} size={52} square /><div><b className="strong" style={{ fontSize: 18 }}>{p.name}</b><div className="muted">{p.category}{p.price?.amount ? ` · ${p.price.currency || ""} ${p.price.amount}` : ""} · created {timeAgo(current.createdAt)}</div></div></div>
                  {p.description && <p style={{ margin: 0, lineHeight: 1.6 }}>{p.description}</p>}
                  {p.positioning && <p className="muted" style={{ margin: 0 }}><b className="strong">Positioning:</b> {p.positioning}</p>}
                  <div><div className="sa-section-label" style={{ marginBottom: 8 }}>Voice</div><div className="sa-chipset">{brand.voice.map((v) => <Pill key={v}>{v}</Pill>)}</div></div>
                  {[["Features", p.features, "blue"], ["Benefits", p.benefits, "green"], ["Use cases", p.uses, "amber"], ["Target audience", p.targetAudience, "violet"], ["Keywords", p.keywords, "gray"]].map(([l, list, tone]) => list?.length ? (
                    <div key={l}><div className="sa-section-label" style={{ marginBottom: 8 }}>{l}</div><div className="sa-chipset">{list.map((x) => <Pill key={x} tone={tone}>{x}</Pill>)}</div></div>
                  ) : null)}
                  {products.length > 1 && (
                    <div><div className="sa-section-label" style={{ marginBottom: 8 }}>All brands ({products.length})</div>
                      <div className="sa-chipset">{products.map((x) => <button key={x._id} type="button" className={cx("sa-chip", x._id === current._id && "on")} onClick={() => selectProduct(x._id)}>{x.aiProfile?.name}</button>)}</div></div>
                  )}
                </div>
              )}
            </>
          )}

          {(tab === "integrations" || tab === "api") && (
            <>
              <h3 style={{ fontSize: 19 }}>Integrations & API</h3>
              <div className="sa-list mt">
                <div className="sa-li"><span className="sa-ic tone-violet"><Icon name="server" size={18} /></span><span className="grow"><b>Sociva backend</b><small className="sa-code">{API_BASE}</small></span>
                  {api == null ? <Spinner /> : api ? <Pill tone="green" icon="checkCircle">Online</Pill> : <Pill tone="red" icon="alert">Offline</Pill>}</div>
                <div className="sa-li"><span className="sa-ic tone-pink"><Icon name="image" size={18} /></span><span className="grow"><b>Instagram Graph API</b><small>{ig.state === "ok" ? `Connected as @${ig.user}` : ig.state === "error" ? ig.msg : "Publishing + profile"}</small></span>
                  {ig.state === "loading" ? <Spinner /> : ig.state === "ok" ? <Pill tone="green">Connected</Pill> : <Btn size="sm" onClick={checkIg}>Test</Btn>}</div>
                <div className="sa-li"><span className="sa-ic tone-amber"><Icon name="sparkles" size={18} /></span><span className="grow"><b>LLM provider</b><small>Gemini / OpenRouter — configured in backend/.env</small></span><Pill tone={online ? "green" : "gray"}>{online ? "Via backend" : "Unknown"}</Pill></div>
              </div>
              <p className="small muted mt">Point the app at another server with <span className="sa-code">VITE_API_URL</span> in <span className="sa-code">frontend/.env</span>.</p>
            </>
          )}

          {tab === "billing" && (
            <>
              <h3 style={{ fontSize: 19 }}>Billing & plan</h3>
              <div className="sa-grid g-3 mt">
                {[["Starter", "$29", ["3 social channels", "1,000 AI credits / mo", "Content calendar"]], ["Growth", "$99", ["10 social channels", "10,000 AI credits / mo", "Autopilot + inbox agents", "Competitor & trend intel"], true], ["Agency", "$299", ["Unlimited clients", "White-label reports", "Client approval portal"]]].map(([n, pr, f, cur]) => (
                  <div key={n} className={cx("sa-goal", cur && "on")} style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div className="row between"><b>{n}</b>{cur && <Pill>Current</Pill>}</div>
                    <div style={{ fontFamily: "var(--sa-head)", fontSize: 30, fontWeight: 800, color: "var(--sa-ink)" }}>{pr}<small className="muted" style={{ fontSize: 14 }}>/mo</small></div>
                    {f.map((x) => <small key={x} className="row" style={{ gap: 6 }}><Icon name="check" size={14} className="green" />{x}</small>)}
                    <Btn size="sm" variant={cur ? "soft" : n === "Agency" ? "primary" : "default"} disabled={cur}>{cur ? "Your plan" : n === "Agency" ? "Upgrade" : "Switch"}</Btn>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="sa-plan" style={{ marginTop: 0, padding: 24 }}>
            <small style={{ opacity: 0.7, letterSpacing: ".08em" }}>CURRENT PLAN</small>
            <b style={{ fontSize: 22, marginTop: 4 }}>Autopilot Pro</b>
            <p style={{ margin: "4px 0 16px" }}>$99 / month · renews Oct 12</p>
            {[["AI credits", "7,240 / 10,000", 72], ["Channels", "7 / 10", 70], ["Team seats", `${TEAM.length} / 10`, 40]].map(([l, v, pct]) => (
              <div key={l} style={{ marginBottom: 12 }}><div className="row between small" style={{ marginBottom: 6 }}><span>{l}</span><span>{v}</span></div><Meter value={pct} color="linear-gradient(90deg,#a78bfa,#f0abfc)" /></div>
            ))}
            <button type="button" className="sa-btn sa-btn-block" style={{ marginTop: 8 }} onClick={() => setParams({ tab: "billing" })}>Upgrade to Agency</button>
          </div>
          <Card title="Integrations">
            {[["database", "red", "CRM", true], ["folder", "blue", "Cloud drive", true], ["message", "violet", "Team chat", false], ["calendar", "amber", "Calendar", true]].map(([ic, t, l, on]) => (
              <div key={l} className="sa-li"><span className={`sa-ic tone-${t}`}><Icon name={ic} size={18} /></span><b className="grow">{l}</b>{on ? <Pill tone="green">Connected</Pill> : <Btn size="sm">Connect</Btn>}</div>
            ))}
          </Card>
          <div className="sa-card" style={{ borderColor: "#fcd2d2" }}>
            <h3 style={{ fontSize: 17, color: "var(--sa-red)" }}>Danger zone</h3>
            <p className="small muted">Pause all Autopilot activity across every channel instantly.</p>
            <Btn className="sa-btn-block sa-btn-danger" icon="pause" onClick={() => toast("Autopilot paused", "success")}>Pause Autopilot</Btn>
          </div>
        </div>
      </div>
    </>
  );
}
