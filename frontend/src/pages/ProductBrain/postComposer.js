// ─────────────────────────────────────────────────────────────
// postComposer.js — turns the AI product profile into a ready-to-share post
// for each platform. Runs in the browser (no extra AI call), so the preview
// updates instantly when you move a slider or edit a field.
// It only uses facts from the profile, so it never invents claims.
// ─────────────────────────────────────────────────────────────

export const PLATFORMS = {
  instagram: { label: "Instagram", limit: 2200, tags: 8 },
  x: { label: "X (Twitter)", limit: 280, tags: 2 },
  whatsapp: { label: "WhatsApp", limit: 4000, tags: 0 },
  linkedin: { label: "LinkedIn", limit: 3000, tags: 3 },
};

const pick = (arr, i) => (arr.length ? arr[((i % arr.length) + arr.length) % arr.length] : "");
const lowerFirst = (s = "") => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const EMOJI = {
  hook: ["✨", "🚀", "🔥", "💡", "👋"],
  bullet: ["✅", "👉", "⭐", "🔹"],
  price: "🏷️",
  cta: "👇",
};

export function formatPrice(price) {
  if (!price || !price.amount) return "";
  const currency = price.currency || "INR";
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: price.amount % 1 ? 2 : 0,
    }).format(price.amount);
  } catch {
    return `${currency} ${price.amount}`;
  }
}

function buildHooks(p, s) {
  const name = p.name || "our new product";
  const cat = lowerFirst(p.category || "");
  const audience = p.targetAudience?.[0];
  const casual = s.formality < 50;
  const playful = s.playful < 45;
  const t = new Set(s.tones);
  const hooks = [];

  if (t.has("Confident")) hooks.push(casual ? `${name} just raised the bar.` : `${name}: built to deliver.`);
  if (t.has("Helpful")) hooks.push(`Here's why ${name} makes everyday life easier.`);
  if (t.has("Witty")) hooks.push(playful ? `Your ${cat || "new favourite"} upgrade has entered the chat.` : `Good ${cat || "products"} shouldn't be hard to find. Meet ${name}.`);
  if (t.has("Bold")) hooks.push(`Stop settling. ${name} is here.`);
  if (t.has("Inspirational")) hooks.push(`Small upgrade, big difference. Meet ${name}.`);
  if (t.has("Data-driven") && p.features?.length >= 2) hooks.push(`${p.features.length} reasons to choose ${name}:`);
  if (t.has("Formal")) hooks.push(`Introducing ${name}${cat ? `, our latest in ${cat}` : ""}.`);
  if (audience) hooks.push(`Made for ${lowerFirst(audience)}: ${name}.`);
  // custom voices the user typed in
  s.tones.filter((x) => !BUILT_IN_TONES.includes(x)).forEach((x) => hooks.push(`${name}. ${x}, the way it should be.`));

  if (!hooks.length) hooks.push(casual ? `Say hello to ${name}.` : `Introducing ${name}.`);
  return hooks;
}

export const BUILT_IN_TONES = ["Confident", "Helpful", "Witty", "Formal", "Bold", "Inspirational", "Data-driven"];

function ctaFor(platform, casual) {
  switch (platform) {
    case "instagram": return casual ? "DM us or tap the link in bio to order" : "Send us a message to place your order.";
    case "x": return casual ? "DM us to grab yours." : "Message us to order.";
    case "whatsapp": return casual ? "Reply here to order yours." :"Reply to this message to place your order.";
    case "linkedin": return "Message us to learn more.";
    default: return "Message us to learn more.";
  }
}

function hashtags(keywords = [], n) {
  if (!n) return "";
  const seen = new Set();
  return keywords
    .map((k) => "#" + k.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((k) => k.length > 2 && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
    .slice(0, n)
    .join(" ");
}

/**
 * @param {object} p        aiProfile from the backend
 * @param {object} s        { tones:[], formality, playful, detail, emoji } — sliders 0..100
 * @param {string} platform instagram | x | whatsapp | linkedin
 * @param {number} variant  bump to get a different hook ("Regenerate")
 */
export function composePost(p, s, platform = "instagram", variant = 0) {
  if (!p) return "";
  const cfg = PLATFORMS[platform] || PLATFORMS.instagram;
  const casual = s.formality < 50;
  const emojiLvl = s.emoji < 10 ? 0 : s.emoji < 45 ? 1 : s.emoji < 80 ? 2 : 3;
  const feats = p.features || [];
  const bens = p.benefits || [];
  const price = formatPrice(p.price);

  let hook = pick(buildHooks(p, s), variant);
  if (emojiLvl >= 1) hook += " " + pick(EMOJI.hook, variant);
  if (platform === "whatsapp" && p.name) hook = hook.split(p.name).join(`*${p.name}*`);

  const bullet = emojiLvl >= 2 ? pick(EMOJI.bullet, variant) : "•";
  const cta = ctaFor(platform, casual) + (emojiLvl >= 3 ? " " + EMOJI.cta : "");
  const tags = hashtags(p.keywords, cfg.tags);
  const priceLine = price ? `${emojiLvl >= 2 ? EMOJI.price + " " : ""}${casual ? "Yours for" : "Price:"} ${price}` : "";

  // X has 280 characters — keep it tight
  if (platform === "x") {
    const build = (nFeat, withPrice, withTags) =>
      [hook, ...feats.slice(0, nFeat).map((f) => `${bullet} ${f}`), withPrice ? priceLine : "", cta, withTags ? tags : ""]
        .filter(Boolean)
        .join("\n");
    for (const [n, pr, tg] of [[3, 1, 1], [2, 1, 1], [2, 1, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]]) {
      const out = build(n, pr, tg);
      if (out.length <= cfg.limit) return out;
    }
    return build(0, 0, 0).slice(0, cfg.limit - 1) + "…";
  }

  const nFeat = Math.min(feats.length, 2 + Math.round(s.detail / 25));
  const lines = [hook];

  if (s.detail >= 40 && p.description) lines.push("", p.description);
  if (nFeat) {
    lines.push("");
    if (s.detail >= 60) lines.push(casual ? "What you get:" : "Key features:");
    feats.slice(0, nFeat).forEach((f) => lines.push(`${bullet} ${f}`));
  }
  if (bens.length) {
    const b = bens.slice(0, s.detail >= 60 ? 3 : 1);
    lines.push("", `${casual ? "Why you'll love it" : "Why it matters"}: ${b.map(lowerFirst).join("; ")}.`.replace(/\.\.$/, "."));
  }
  if (s.detail >= 70 && p.targetAudience?.length > 1) {
    lines.push(`Perfect for ${p.targetAudience.slice(0, 3).map(lowerFirst).join(", ")}.`);
  }
  if (priceLine) lines.push("", priceLine);
  lines.push("", cta);
  if (tags) lines.push("", tags);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 0..100 — how complete the profile is (shown next to the preview) */
export function profileStrength(p) {
  if (!p) return 0;
  const checks = [
    !!p.name,
    !!p.category,
    !!p.description,
    (p.features || []).length >= 3,
    (p.benefits || []).length >= 1,
    (p.uses || []).length >= 1,
    (p.targetAudience || []).length >= 1,
    !!p.price?.amount,
    !!p.positioning,
    (p.keywords || []).length >= 3,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** The agent returns an all-empty profile when the text isn't a product */
export function isEmptyProfile(p) {
  return !p || (!p.name && !p.description && !(p.features || []).length && !(p.keywords || []).length);
}
