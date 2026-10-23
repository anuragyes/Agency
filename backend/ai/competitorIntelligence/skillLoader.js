// ─────────────────────────────────────────────────────────────
// skillLoader.js — reads the agent skill files (skills/*.md)
//   name     = the "# Title" line
//   meta     = the "> id: … · stage: … · engine: …" line
//   config   = the ```json block under "## Config"  (used by the code at run time)
//   llmRules = the text under "## Instructions for the LLM" (used as system rules)
// Files are cached; edit a .md and restart the server (or call reloadSkills()).
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "skills");
let cache = null;

const section = (text, title) => {
    const re = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    const m = re.exec(text);
    if (!m) return "";
    const rest = text.slice(m.index + m[0].length);
    const next = rest.search(/^##\s+/m);
    return (next === -1 ? rest : rest.slice(0, next)).trim();
};

const parseSkill = (file, text) => {
    const name = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || file;
    const metaLine = (text.match(/^>\s*(.+)$/m) || [])[1] || "";
    const meta = {};
    for (const part of metaLine.split("·")) {
        const i = part.indexOf(":");
        if (i > 0) meta[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    let config = {};
    const cfg = section(text, "Config").match(/```json\s*([\s\S]*?)```/);
    if (cfg) {
        try { config = JSON.parse(cfg[1]); } catch (e) { console.error(`[skills] bad JSON config in ${file}: ${e.message}`); }
    }
    return {
        file,
        name,
        ids: String(meta.id || "").split(",").map((s) => s.trim()).filter(Boolean),
        stage: meta.stage || "",
        engine: meta.engine || "code",
        role: section(text, "Role"),
        llmRules: section(text, "Instructions for the LLM"),
        config,
        markdown: text,
    };
};

const loadSkills = () => {
    if (cache) return cache;
    const byId = new Map();
    const list = [];
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").sort()) {
        const skill = parseSkill(file, fs.readFileSync(path.join(DIR, file), "utf8"));
        list.push(skill);
        skill.ids.forEach((id) => byId.set(id, skill));
    }
    cache = { list, byId };
    return cache;
};

/** getSkill("post_analysis") -> { name, config, llmRules, … } (empty skill if missing) */
const getSkill = (id) => loadSkills().byId.get(id) || { file: null, name: id, ids: [id], engine: "code", role: "", llmRules: "", config: {}, markdown: "" };
const skillConfig = (id) => getSkill(id).config || {};
const reloadSkills = () => { cache = null; return loadSkills(); };

module.exports = { loadSkills, getSkill, skillConfig, reloadSkills, _internals: { parseSkill, section } };
