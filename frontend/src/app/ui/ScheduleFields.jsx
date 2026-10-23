// ScheduleFields.jsx — "Schedule for later": date + time pickers (browser's local time zone) + quick picks.
// Used by the Content Editor (after Approve) and the Calendar (change a scheduled post's date & time).
import { useState } from "react";
import Icon from "./Icon";
import { Field, cx } from "./kit";
import { formatSchedule, fromScheduleInputs, scheduleError, timeUntil, toDateInput, toTimeInput } from "../postUtils";

const dayAt = (days, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
};
const quickPicks = () => {
  const now = Date.now();
  const step = 15 * 60_000;
  const list = [["In 1 hour", new Date(Math.ceil((now + 60 * 60_000) / step) * step)]];
  const tonight = dayAt(0, 19, 15);
  if (tonight.getTime() > now + 30 * 60_000) list.push(["Tonight 7:15 PM", tonight]);
  list.push(["Tomorrow 9 AM", dayAt(1, 9, 0)], ["Tomorrow 7:15 PM", dayAt(1, 19, 15)]);
  return list;
};
const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
})();

/** value { date: "YYYY-MM-DD", time: "HH:MM" } · onChange(next) */
export default function ScheduleFields({ value, onChange, disabled }) {
  const [today] = useState(() => toDateInput(new Date()));
  const [picks] = useState(quickPicks);
  const err = scheduleError(value);
  const at = fromScheduleInputs(value);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="sa-grid g-2" style={{ gap: 12 }}>
        <Field label="Date">
          <input type="date" className="sa-input" min={today} value={value.date} disabled={disabled}
            onChange={(e) => onChange({ ...value, date: e.target.value })} aria-label="Publish date" />
        </Field>
        <Field label="Time">
          <input type="time" className="sa-input" value={value.time} disabled={disabled}
            onChange={(e) => onChange({ ...value, time: e.target.value })} aria-label="Publish time" />
        </Field>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {picks.map(([label, d]) => {
          const v = { date: toDateInput(d), time: toTimeInput(d) };
          const on = v.date === value.date && v.time === value.time;
          return (
            <button key={label} type="button" className={cx("sa-chip", on && "on")} style={{ height: 32, padding: "0 12px", fontSize: 13.5 }}
              disabled={disabled} onClick={() => onChange(v)} aria-pressed={on}>{label}</button>
          );
        })}
      </div>
      <p className={cx("small", err ? "red" : "muted")} style={{ margin: 0 }}>
        <Icon name={err ? "alert" : "clock"} size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {err || <>Goes live <b className="strong">{formatSchedule(at)}</b> ({timeUntil(at)}){TZ ? ` · ${TZ} time` : ""}</>}
      </p>
    </div>
  );
}
