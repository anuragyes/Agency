// DM automation — visual flow builder (demo; automation backend not built yet)
import { useState } from "react";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Btn, Card, DemoTag, Field, IconBtn, LiveTag, PageHeader, Pill, Segmented, cx, useToast } from "../ui/kit";
import { useWorkspace } from "../store";

const AUTOMATIONS = [
  { id: "c2d", ch: "instagram", name: "Comment-to-demo", meta: "1,284 runs · 18% conv.", status: "Live" },
  { id: "faq", ch: "facebook", name: "FAQ assistant", meta: "3,410 runs", status: "Live" },
  { id: "order", ch: "whatsapp", name: "Order follow-up", meta: "622 runs", status: "Live" },
  { id: "welcome", ch: "linkedin", name: "Connection welcome", meta: "Paused", status: "Paused" },
  { id: "give", ch: "tiktok", name: "Giveaway entries", meta: "Draft", status: "Draft" },
];
const NODES = [
  { id: "t", x: 24, y: 40, k: "TRIGGER", icon: <PlatformIcon platform="instagram" size={34} />, title: "Comment contains keyword", body: "Any post · keywords:", chips: ["DEMO", "PRICE", "INFO"] },
  { id: "ai", x: 400, y: 40, k: "AI STEP", icon: <span className="sa-ic tone-grad" style={{ width: 34, height: 34 }}><Icon name="sparkles" size={17} /></span>, title: "Send DM & qualify lead", body: "Ask about team size, current tools and timeline. Score intent 0–100.", tags: ["Brand voice", "3 questions"] },
  { id: "c", x: 240, y: 330, k: "CONDITION", icon: <span className="sa-ic tone-amber" style={{ width: 34, height: 34 }}><Icon name="branch" size={17} /></span>, title: "Intent score", w: 270, pills: [["green", "≥ 70 Hot"], ["blue", "< 70 Nurture"]] },
  { id: "b", x: 24, y: 560, k: "ACTION", icon: <span className="sa-ic tone-green" style={{ width: 34, height: 34 }}><Icon name="calendar" size={17} /></span>, title: "Send booking link", body: "Calendly · 30-min demo" },
  { id: "g", x: 440, y: 560, k: "ACTION", icon: <span className="sa-ic tone-blue" style={{ width: 34, height: 34 }}><Icon name="bookOpen" size={17} /></span>, title: "Send free guide", body: "\"Agency reporting playbook\" PDF" },
  { id: "crm", x: 24, y: 740, k: "ACTION", icon: <span className="sa-ic tone-violet" style={{ width: 34, height: 34 }}><Icon name="database" size={17} /></span>, title: "Create lead in CRM", body: "HubSpot · owner: Sarah J." },
  { id: "f", x: 440, y: 740, k: "DELAY + AI", icon: <span className="sa-ic tone-red" style={{ width: 34, height: 34 }}><Icon name="timer" size={17} /></span>, title: "Follow up in 3 days", body: "Personalised check-in message" },
];

export default function DMAutomation() {
  const toast = useToast();
  const { brandName } = useWorkspace();
  const [auto, setAuto] = useState("c2d");
  const [sel, setSel] = useState("ai");
  const [tab, setTab] = useState("builder");
  const [zoom, setZoom] = useState(80);
  const a = AUTOMATIONS.find((x) => x.id === auto);
  const node = NODES.find((n) => n.id === sel);

  return (
    <>
      <PageHeader crumbs={[{ label: "DM Automation", to: "/app/dm" }, { label: a.name }]} title={<>DM automation <DemoTag /></>}>
        <Segmented value={tab} onChange={setTab} options={[{ value: "builder", label: "Builder" }, { value: "conversations", label: "Conversations" }, { value: "analytics", label: "Analytics" }]} />
        <Btn icon="flask" onClick={() => toast("Test DM sent to your own account (demo)", "success")}>Test</Btn>
        <Btn variant="primary" icon="rocket" onClick={() => toast("Changes published (demo)", "success")}>Publish changes</Btn>
      </PageHeader>

      <div className="sa-grid g-dm">
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Card title="Automations" action={<IconBtn icon="plus" label="New automation" style={{ width: 34, height: 34 }} />} style={{ padding: 14 }}>
            {AUTOMATIONS.map((x) => (
              <button key={x.id} type="button" className="row" onClick={() => setAuto(x.id)} style={{ width: "100%", textAlign: "left", padding: 12, borderRadius: 14, background: x.id === auto ? "var(--sa-primary-50)" : undefined }}>
                <PlatformIcon platform={x.ch} size={32} />
                <span className="grow"><b className="strong" style={{ color: x.id === auto ? "var(--sa-primary-ink)" : undefined }}>{x.name}</b><div className="small muted">{x.meta}</div></span>
                {x.status === "Live" && <i style={{ width: 7, height: 7, borderRadius: 7, background: "var(--sa-green)" }} />}
              </button>
            ))}
          </Card>
          <Card title="Last 7 days">
            {[["Conversations", "1,284"], ["Qualified leads", "312"], ["Demos booked", "58"], ["Handled without human", "91%"]].map(([l, v], i) => (
              <div key={l} className="row between" style={{ padding: "7px 0" }}><span className="muted">{l}</span><b className={i === 3 ? "green" : "strong"}>{v}</b></div>
            ))}
          </Card>
        </div>

        <div className="sa-flow">
          <div style={{ width: 760 * zoom / 100, height: 900 * zoom / 100 }}><div style={{ position: "relative", width: 760, height: 900, transform: `scale(${zoom / 100})`, transformOrigin: "0 0" }}>
            <svg width="760" height="900" style={{ position: "absolute", inset: 0 }} aria-hidden>
              <path d="M324 110 C 360 110, 370 140, 400 140" stroke="#c4b5fd" strokeWidth="2" fill="none" />
              <path d="M570 230 C 570 290, 380 280, 375 330" stroke="#c4b5fd" strokeWidth="2" fill="none" />
              <path d="M375 440 C 375 500, 175 490, 175 560" stroke="#5eead4" strokeWidth="2" fill="none" />
              <path d="M375 440 C 375 500, 590 490, 590 560" stroke="#7dd3fc" strokeWidth="2" fill="none" />
              <path d="M175 680 L 175 740" stroke="#5eead4" strokeWidth="2" fill="none" />
              <path d="M590 680 L 590 740" stroke="#7dd3fc" strokeWidth="2" fill="none" />
            </svg>
            {NODES.map((n) => (
              <div key={n.id} className={cx("sa-node", sel === n.id && "sel")} style={{ left: n.x, top: n.y, width: n.w || 300 }} onClick={() => setSel(n.id)}>
                <div className="k">{n.k}</div>
                <h5>{n.icon}{n.title}</h5>
                {n.body && <p>{n.body} {n.chips && n.chips.map((c) => <Pill key={c} style={{ margin: "4px 4px 0 0" }}>{c}</Pill>)}</p>}
                {n.tags && <div className="row mt-s">{n.tags.map((t) => <Pill key={t} tone="outline">{t}</Pill>)}</div>}
                {n.pills && <div className="row">{n.pills.map(([t, l]) => <Pill key={l} tone={t}>{l}</Pill>)}</div>}
              </div>
            ))}
          </div></div>
          <div className="row" style={{ position: "sticky", bottom: 0, left: 0, justifyContent: "space-between", marginTop: 8 }}>
            <Btn size="sm" icon="plus" onClick={() => toast("Step library coming soon")}>Add step</Btn>
            <div className="row" style={{ gap: 6 }}>
              <IconBtn icon="minus" label="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))} />
              <span className="sa-btn sa-btn-sm" style={{ minWidth: 70 }}>{zoom}%</span>
              <IconBtn icon="plus" label="Zoom in" onClick={() => setZoom((z) => Math.min(130, z + 10))} />
              <IconBtn icon="expand" label="Fit" onClick={() => setZoom(80)} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Card title={<span className="row"><Icon name="phone" size={18} /> Live preview</span>} action={<PlatformIcon platform="instagram" size={26} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="sa-msg them" style={{ alignSelf: "flex-end", background: "#f1f1f6", border: 0 }}>DEMO</div>
              <div className="sa-msg me" style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)" }}>Hey Jessica! Thanks for your interest in {brandName}. Quick question so I can point you to the right thing — how many clients does your team manage?</div>
              <div className="sa-msg them" style={{ alignSelf: "flex-end", background: "#f1f1f6", border: 0 }}>around 12, team of 6</div>
              <div className="sa-msg me" style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)" }}>Perfect — that's exactly who the Agency plan is built for. Want to see it live? Pick a time here 👇</div>
              <div className="sa-card" style={{ padding: 0, overflow: "hidden", maxWidth: 260, marginLeft: "auto" }}>
                <div style={{ height: 90, background: "linear-gradient(135deg,#8b5cf6,#6366f1)" }} />
                <div style={{ padding: 12 }}><b className="strong small">Book a 30-min demo</b><div className="small muted">northbeam.studio/demo</div></div>
              </div>
              <div className="small green strong row" style={{ justifyContent: "center", marginTop: 8 }}><Icon name="checkCircle" size={15} />Intent score 92 → Hot lead</div>
            </div>
          </Card>
          <Card title="Step settings" sub={node?.k}>
            <Field label="Title"><input className="sa-input" defaultValue={node?.title} key={node?.id} /></Field>
            {node?.body && <div className="mt"><Field label="Details"><textarea className="sa-textarea" defaultValue={node.body} key={node.id + "b"} /></Field></div>}
            <div className="row mt"><LiveTag>{a.status}</LiveTag><span className="small muted">Changes save when you publish.</span></div>
          </Card>
        </div>
      </div>
    </>
  );
}
