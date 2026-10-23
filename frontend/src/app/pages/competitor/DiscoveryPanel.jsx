// ─────────────────────────────────────────────────────────────
// DiscoveryPanel.jsx — Method 2: AI-powered competitor discovery
//   brand context -> hashtag search + @mentions (+ optional 1 AI call) -> every account VERIFIED
//   with the Instagram Business Discovery API -> relevance score (code) -> user confirms.
// Backend: POST /api/competitor-research/discover (services/competitorIntelligence/discoveryService.js)
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon from "../../ui/Icon";
import { Btn, ChipInput, Pill, Toggle, cx, fmt, useToast } from "../../ui/kit";
import { HBarList } from "../../ui/intelCharts";
import { discoverCompetitors } from "../../api";

const SOURCE_TONE = (s) => (s === "AI suggestion" ? "pink" : s.startsWith("#") ? "blue" : "violet");

export default function DiscoveryPanel({ productId, profile, selected, max, onAdd, onAddMany }) {
  const toast = useToast();

  const [prompt, setPrompt] = useState("");
  const [seeds, setSeeds] = useState(() => (profile?.keywords || []).slice(0, 3));
  const [useAI, setUseAI] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const chosen = new Set(selected.map((s) => s.username));

  const run = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      setResult(await discoverCompetitors({
        productId,
        prompt: prompt.trim(),
        seeds,
        known: selected.map((s) => s.username),
        useAI,
        limit: 15,
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cands = result?.candidates || [];
  const addTop = () => {
    const room = max - selected.length;
    const pick = cands.filter((c) => !chosen.has(c.username)).slice(0, Math.min(room, 10));
    if (!pick.length) { toast(room <= 0 ? `Max ${max} competitors` : "Nothing new to add", "error"); return; }
    onAddMany(pick);
  };



  return (
    <div className="mt">
      <div className="sa-li" style={{ background: "#f7f6ff", borderRadius: 14, padding: 14, alignItems: "flex-start" }}>
        <span className="sa-ic tone-violet"><Icon name="brain" size={18} /></span>
        <span className="grow">
          <b>Brand context: {profile?.name}</b>
          <small style={{ display: "block" }}>{profile?.category}{profile?.targetAudience?.length ? ` · audience: ${profile.targetAudience.slice(0, 2).join(", ")}` : ""}</small>
          <small className="faint" style={{ display: "block" }}>The AI discovery pipeline finds verified competitor accounts using your prompt and brand context.</small>
        </span>
      </div>

      {/* AI Discovery Prompt Input */}
      <div className="mt">
        <label className="sa-field" style={{ margin: 0 }}>
          <span className="sa-field-label" style={{ fontWeight: 600, alignItems: "center", gap: 6 }}>

            AI Discovery Prompt
          </span>
          <div className="sa-prompt row" style={{ padding: "8px 12px 8px 16px", marginTop: 6, border: "1px solid var(--sa-border, #e2e8f0)", borderRadius: 12, background: "var(--sa-surface, #fff)" }}>
            <input
              className="grow"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && run()}
              placeholder="e.g. I am targeting pages which are most popular in protein supplements, give me accounts of those brands in Instagram"
              aria-label="AI competitor discovery prompt"
              style={{ border: 0, outline: 0, fontSize: 15, height: 40, background: "none" }}
            />
            <Btn variant="grad" icon="sparkles" onClick={run} loading={busy}>
              {busy ? "Discovering…" : "Discover"}
            </Btn>
          </div>
        </label>

      </div>

      <div className="sa-grid g-main-r mt" style={{ alignItems: "end" }}>
        <label className="sa-field" style={{ margin: 0 }}>
          <span className="sa-field-label">Additional keywords / hashtags (optional)</span>
          <ChipInput values={seeds} onChange={(v) => setSeeds(v.slice(0, 5))} placeholder="e.g. whey protein, nutrition, fitness" />
        </label>
        <div className="row wrap" style={{ gap: 12, justifyContent: "flex-end" }}>
          <span className="row small" style={{ gap: 8 }}><Toggle checked={useAI} onChange={setUseAI} label="AI suggestions" />AI suggestions <span className="faint">(verified via Instagram API)</span></span>
          {!prompt && (
            <Btn variant="primary" icon="search" onClick={run} loading={busy}>
              Search by keywords
            </Btn>
          )}
        </div>
      </div>
      {
        busy && (
          <p className="small muted mt-s" style={{ marginBottom: 0 }}>
            {prompt
              ? `AI is discovering accounts for "${prompt.slice(0, 45)}..." and verifying each via Meta's Business Discovery API… 10–25 seconds.`
              : "Searching hashtags, reading mentions, asking the AI for candidates, then verifying every account with the Instagram API… 15–40 seconds."}
          </p>
        )
      }
      {error && <div className="sa-banner tone-red mt"><Icon name="alert" /><div className="small grow">{error}</div></div>}

      {
        result && (
          <div className="mt">
            <div className="sa-kpis">
              <div className="sa-kpi"><span>Candidates found</span><b>{result.stats.candidatesFound}</b><small>hashtags · mentions{result.stats.llmCalls ? " · AI" : ""}</small></div>
              <div className="sa-kpi"><span>Checked with Instagram API</span><b>{result.stats.checked}</b><small>Business Discovery</small></div>
              <div className="sa-kpi"><span>Verified business accounts</span><b>{result.stats.verified}</b><small>{result.rejected.length} not found / personal</small></div>
              <div className="sa-kpi"><span>Relevant to {profile?.name}</span><b>{cands.length}</b><small>{result.stats.llmCalls} LLM call · {Math.round(result.stats.durationMs / 1000)}s</small></div>
            </div>

            {result.steps?.length > 0 && (
              <div className="sa-chipset mt-s">
                {result.steps.map((s, i) => (
                  <Pill key={i} tone={s.note ? "amber" : "gray"} title={s.note || ""}>
                    {s.source === "hashtag" ? s.tag : s.source === "mentions" ? `mentions of ${s.of}` : "AI"} → {s.found}{s.note ? " ⚠" : ""}
                  </Pill>
                ))}
              </div>
            )}

            {cands.length > 0 ? (
              <div className="sa-grid g-main-r mt">
                <div className="sa-list">
                  {cands.map((c) => (
                    <div key={c.username} className="sa-li" style={{ alignItems: "flex-start" }}>
                      {c.profilePictureUrl ? <img className="sa-profile-pic" src={c.profilePictureUrl} alt="" referrerPolicy="no-referrer" /> : <span className="sa-profile-pic" />}
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="row wrap" style={{ gap: 6 }}>
                          <b style={{ display: "inline" }}>@{c.username}</b>
                          <Pill tone={c.relevance >= 60 ? "green" : c.relevance >= 35 ? "amber" : "gray"} icon="target">{c.relevance}/100 relevant</Pill>
                          <Pill tone="green" icon="shieldCheck">Verified</Pill>
                        </span>
                        <small style={{ display: "block" }}>{c.name && `${c.name} · `}{fmt(c.followers)} followers · {fmt(c.mediaCount)} posts{c.engagementRate != null && ` · ${c.engagementRate}% eng.`}</small>
                        {c.biography && <small className="faint" style={{ display: "block" }}>{c.biography.slice(0, 140)}</small>}
                        <small className="faint" style={{ display: "block", marginTop: 3 }}>{c.reasons.join(" · ")}</small>
                        <span className="sa-chipset mt-s">{c.sources.map((s) => <Pill key={s} tone={SOURCE_TONE(s)}>{s}</Pill>)}</span>
                      </span>
                      {chosen.has(c.username)
                        ? <Pill tone="green" icon="check">Added</Pill>
                        : <Btn size="sm" variant="primary" icon="plus" disabled={selected.length >= max} onClick={() => onAdd(c)}>Add</Btn>}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="sa-section-label" style={{ marginBottom: 10 }}>Relevance score</div>
                  <HBarList labelWidth={110} max={100} rows={cands.slice(0, 12).map((c) => ({ key: c.username, label: `@${c.username}`, value: c.relevance, display: `${c.relevance}`, highlight: chosen.has(c.username) }))} />
                  <p className="small faint">Highlighted = already added. Score = keyword fit + hashtag fit + recent activity + audience size + found by several sources (weights in <code>competitor-discovery.md</code>).</p>
                  <Btn variant="soft" icon="userPlus" onClick={addTop} disabled={selected.length >= max}>Add top {Math.min(10, Math.max(0, max - selected.length))} to my competitors</Btn>
                </div>
              </div>
            ) : <p className="muted small mt">No relevant verified business accounts found. Try other keywords, or add a known competitor manually and discover again (we read who they mention).</p>}
            {result.notes?.length > 0 && <ul className={cx("small faint mt-s")} style={{ paddingLeft: 18, marginBottom: 0 }}>{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        )
      }
    </div >
  );
}
