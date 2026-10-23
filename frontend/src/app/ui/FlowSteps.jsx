// FlowSteps.jsx — the step bar shared by the Studio and the Editor
// Prompt & platform → Review brief → Platform research → Drafts → Review & publish
import Icon from "./Icon";
import { cx } from "./kit";

/**
 * steps   [{ label, sub }]
 * current index of the active step
 * reached highest index the user may jump to (completed steps are clickable)
 * onStep  (i) => void
 */
export default function FlowSteps({ steps, current, reached = current, onStep }) {
  return (
    <ol className="sa-stepbar" aria-label="Steps">
      {steps.map((s, i) => {
        const done = i < current || (s.done && i !== current);
        const can = onStep && i !== current && i <= reached && !s.disabled;
        return (
          <li key={s.label} className={cx(done && "done", i === current && "on", s.disabled && "off")} aria-current={i === current ? "step" : undefined}>
            <button type="button" className={cx(can && "can")} onClick={() => can && onStep(i)} disabled={!can}>
              <span className="n">{done ? <Icon name="check" size={15} stroke={2.6} /> : i + 1}</span>
              <span className="t"><b>{s.label}</b>{s.sub && <small>{s.sub}</small>}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
