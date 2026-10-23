// intelTheme.js — shared constants for the Competitor Intelligence charts (kept out of the .jsx for fast refresh)
// categorical slots (validated order) — formats always get the same color
export const FORMAT_COLORS = { reel: "#2a78d6", carousel: "#eb6834", image: "#1baf7a", video: "#eda100", text: "#9a9db0" };
export const FORMAT_LABEL = { reel: "Reel", carousel: "Carousel", image: "Photo", video: "Video", text: "Text" };
export const STATUS_META = {
  done: { tone: "green", icon: "checkCircle", label: "Done", color: "var(--sa-green)" },
  running: { tone: "blue", icon: "refresh", label: "Running", color: "var(--sa-blue)" },
  failed: { tone: "red", icon: "alert", label: "Failed", color: "var(--sa-red)" },
  waiting: { tone: "amber", icon: "clock", label: "Waiting", color: "var(--sa-amber)" },
  queued: { tone: "gray", icon: "pause", label: "Queued", color: "var(--sa-gray-400)" },
  skipped: { tone: "gray", icon: "minus", label: "Skipped", color: "var(--sa-gray-400)" },
};


export const msLabel = (ms) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
