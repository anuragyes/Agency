// brand.js — Brand Brain settings that the backend doesn't store yet (voice, sliders, goals).
// Kept per product in localStorage and turned into a prompt hint for the AI post writer.
const key = (id) => `sociva.brand.${id || "none"}`;

export const DEFAULT_BRAND = {
  voice: ["Confident", "Helpful", "Witty"],
  formality: 62, // casual -> professional
  playful: 38, // playful -> serious
  detail: 30, // concise -> detailed
  emoji: 20, // none -> lots
  goals: ["leads", "awareness"],
  channels: ["instagram"],
};

export const readBrand = (id) => {
  try {
    return { ...DEFAULT_BRAND, ...(JSON.parse(localStorage.getItem(key(id))) || {}) };
  } catch {
    return { ...DEFAULT_BRAND };
  }
};
export const saveBrand = (id, data) => {
  try {
    localStorage.setItem(key(id), JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

export const emojiLabel = (v) => (v < 10 ? "none" : v < 40 ? "a little" : v < 75 ? "some" : "lots");

/** Short instruction appended to userPrompt so generated posts follow the brand voice */
export const voiceHint = (b) => {
  if (!b) return "";
  const parts = [];
  if (b.voice?.length) parts.push(`Tone: ${b.voice.join(", ")}`);
  parts.push(b.formality > 60 ? "professional" : b.formality < 40 ? "casual" : "balanced formality");
  parts.push(b.playful > 60 ? "serious" : b.playful < 40 ? "playful" : "lightly playful");
  parts.push(b.detail > 60 ? "detailed" : "concise");
  parts.push(`emoji: ${emojiLabel(b.emoji)}`);
  return `Brand voice → ${parts.join(", ")}.`;
};
