// ─────────────────────────────────────────────────────────────
// PlatformBriefSpecs.js — platforms the user can pick in Studio step 4
// live = a researcher + publish backend exists for that platform
// ─────────────────────────────────────────────────────────────

const PLATFORM_SPECS = {
    instagram: { label: "Instagram", formats: ["carousel", "image", "reel"], live: true },
    youtube: { label: "YouTube", formats: ["short", "video"], live: false },
    facebook: { label: "Facebook", formats: ["text", "image", "carousel", "reel"], live: true },
    linkedin: { label: "LinkedIn", formats: ["post", "carousel", "article"], live: false },
    x: { label: "X", formats: ["post", "thread"], live: false },
};

const PLATFORMS = Object.keys(PLATFORM_SPECS);
const GOALS = ["awareness", "engagement", "sales", "traffic", "community"];
// what the user may ask for in the prompt ("make a reel ...") -> each researcher maps it to its own formats
const FORMAT_HINTS = ["reel", "carousel", "image", "video", "short", "post", "thread", "article"];

/** formatHint from the JSON -> Instagram content type (default carousel) */
const instagramFormat = (hint) => {
    const h = String(hint || "").toLowerCase();
    if (/reel|video|short/.test(h)) return "reel";
    if (/image|photo|picture|post/.test(h)) return "image";
    return "carousel";
};

module.exports = { PLATFORM_SPECS, PLATFORMS, GOALS, FORMAT_HINTS, instagramFormat };
