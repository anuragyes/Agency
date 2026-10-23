// ─────────────────────────────────────────────────────────────
// ImageGenerator.jsx — "Generate with AI" (the other option: the user's own image / URL)
//   1. Describe   prompt + size + how many (1–4) + how the photo is made        (no sketch step)
//   2. Generate   POST /api/image-gen/batch -> AI plans texts + 4 styles -> up to 4 photos in DIFFERENT styles,
//                 made in the background; we poll GET /api/image-gen?batchId= and show each one as it lands
//   3. Pick       image post = select ONE · carousel = select several (order = slide order)
//                 every image has its OWN headline / subline / CTA (a different hook). The side panel edits ONE image
//                 (text + font) or a GROUP / ALL images (font) — POST /batch/:id/texts { ids } redraws only those, no AI call
//   4. Use        onUse([media]) adds the chosen JPEG(s) to the post
//   Brand kit (GET /options -> brand): fixed fonts + colours (no font picker), "Used for" post / ad (logo size) and
//   one corner per set. Brand mark = the user's uploaded LOGO (the separate "icon" upload was removed). The backend
//   makes the logo's own background transparent and trims it, then draws it tight in the chosen corner
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Banner, Btn, Field, Modal, Pill, Segmented, Spinner, cx, useToast } from "./kit";
import {
  createAdImageSet,
  generateAdImage,
  getImageGenHealth,
  getImageGenOptions,
  listAdImages,
  removeProductIcon,
  removeProductLogo,
  removeProductPhoto,
  updateAdImageSetTexts,
  uploadProductLogo,
  uploadProductPhoto,
} from "../../api/imageGenApi";
import { useWorkspace } from "../store";
import { API_BASE } from "../../api/productApi";

const ASPECTS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "9:16", label: "9:16 Story / Reel" },
];
const MAX_IMAGES = 4;
const COUNTS = [1, 2, 3, 4].map((n) => ({ value: n, label: `${n}` }));
const LIMITS = { headline: 48, subline: 90, cta: 28 };
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const POLL_MS = 3000;
/* how the photo is made (backend: services/imageGen/imageProviders.js) — the server's list wins when it answers */
const DEFAULT_MODES = [
  { value: "product", label: "Your real product photo in an AI scene", needsPhoto: true },
  { value: "scene", label: "AI scene from your description" },
];
const MODE_HINT = {
  product: "Best for ads: your exact jar / pack and label, placed into each AI scene and relit to match.",
  scene: "The AI paints everything from your prompt — people, food, setting. The product and its label are AI-drawn (may not be exact).",
  sketch: "Simple product shot (the only mode of a local Stable Diffusion).",
};
const STEPS = ["Describe", "Generate", "Pick & use"];
/* brand kit (backend: ai/imageGen/BrandKit.js) — what the images are for + where the logo goes (same corner for the whole set) */
const PURPOSES = [
  { value: "social", label: "Social post" },
  { value: "ad", label: "Advertisement" },
];
const LOGO_CORNERS = [
  { value: "top-left", label: "Top-left" },
  { value: "bottom-right", label: "Bottom-right" },
];
/* brand mark: the user's logo only (uploading a logo also clears an old icon on the backend) */
const MARK = { name: "logo", upload: uploadProductLogo, remove: removeProductLogo, field: "logoUrl" };
/** product / job -> the brand mark in use (an icon uploaded before the icon option was removed still counts as the logo) */
const assetsOf = (src = {}, photoUrl) => ({ logoUrl: src.logoUrl || src.iconUrl || null, photoUrl: photoUrl ?? (src.photoUrl || null) });

const defaultAspect = (post) => (post?.contentType === "reel" ? "9:16" : ["1:1", "4:5", "9:16"].includes(post?.content?.visual?.aspectRatio) ? post.content.visual.aspectRatio : "4:5");
const defaultPrompt = (post, productName) => {
  const v = post?.content?.visual;
  return [v?.brief, v?.style].filter(Boolean).join(". ") || (productName ? `A premium photo of ${productName}` : "");
};
const byCreation = (list = []) => [...list].sort((a, b) => String(a._id).localeCompare(String(b._id)));
const textsOf = (item) => ({ headline: item?.layout?.texts?.headline || "", subline: item?.layout?.texts?.subline || "", cta: item?.layout?.texts?.cta || "" });
const fontPairOf = (item) => item?.layout?.fontPair || "";
const hookOf = (item) => item?.layout?.style?.hook || "";
/** the one font every image uses, or "" when they differ */
const commonFont = (list = []) => {
  const fonts = [...new Set(list.map(fontPairOf).filter(Boolean))];
  return fonts.length === 1 ? fonts[0] : "";
};
const sameTexts = (a, b) => ["headline", "subline", "cta"].every((k) => (a?.[k] || "") === (b?.[k] || ""));

/** @font-face for each pair's heading + body font, once per page (the font picker shows every option in its own font) */
const loadFontFaces = (pairs = []) => {
  if (typeof document === "undefined" || document.getElementById("sa-ad-fonts")) return;
  const seen = new Set();
  const css = pairs.flatMap((p) => [p.heading, p.body]).filter((f) => f?.url && !seen.has(f.url) && seen.add(f.url))
    .map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;font-display:swap;src:url("${API_BASE}${f.url}") format("woff");}`)
    .join("\n");
  const el = document.createElement("style");
  el.id = "sa-ad-fonts";
  el.textContent = css;
  document.head.appendChild(el);
};
const mediaOf = (item) => item.media || { type: "image", url: item.images.finalUrl, mimeType: "image/jpeg", source: "upload" };

export default function ImageGenerator({ open, onClose, post, platform, productId, productName, onUse, contentType }) {
  const toast = useToast();
  const { products, refreshProducts } = useWorkspace?.() || {};
  const type = contentType || post?.contentType;
  const multi = type === "carousel"; // carousel / photo album -> pick several; image post -> pick one

  const [health, setHealth] = useState(null); // null = checking
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("4:5");
  const [count, setCount] = useState(MAX_IMAGES);
  const [mode, setMode] = useState(""); // "" = automatic (your photo if uploaded, else AI scene)
  const [batchId, setBatchId] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]); // ids, in the order picked (= carousel order)
  const [texts, setTexts] = useState({ headline: "", subline: "", cta: "" });
  const [fontPairs, setFontPairs] = useState([]); // curated pairs from GET /options
  const [fontPair, setFontPair] = useState(""); // font in the editor ("" = images use different fonts)
  const [editIds, setEditIds] = useState([]); // images the side panel edits: 1 = text + font, 2+ = font for that group
  const editIdsRef = useRef([]);
  const [assets, setAssets] = useState({ logoUrl: null, photoUrl: null });
  const [brandKit, setBrandKit] = useState(null); // GET /options -> brand rules (fixed fonts / colours, logo rules)
  const [purpose, setPurpose] = useState("social"); // logo 15–22 % wide (post) or 18–25 % (ad)
  const [logoCorner, setLogoCorner] = useState("top-left"); // one corner per campaign (image set)
  const [busy, setBusy] = useState(""); // "create" | "texts" | "logo" | "photo"
  const [elapsed, setElapsed] = useState(0);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const logoRef = useRef(null);
  const photoRef = useRef(null);
  const photoMenuRef = useRef(null);
  const logoMenuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target)) setPhotoMenuOpen(false);
      if (logoMenuRef.current && !logoMenuRef.current.contains(e.target)) setLogoMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const checkHealth = () => {
    setHealth(null);
    getImageGenHealth().then((r) => setHealth(r.data)).catch((e) => setHealth({ ok: false, problems: [e.message] }));
  };

  /** side panel -> the texts + font of the ONE image being edited, or the shared font of a group ("" = mixed) */
  const syncEditor = (list, ids) => {
    const group = ids.map((id) => list.find((i) => i._id === id)).filter(Boolean);
    if (group.length === 1) setTexts(textsOf(group[0]));
    setFontPair(commonFont(group));
  };
  /** edit exactly these images (always at least one) */
  const pickEdit = (ids, list = items) => {
    const next = ids.length ? ids : list[0] ? [list[0]._id] : [];
    editIdsRef.current = next;
    setEditIds(next);
    syncEditor(list, next);
  };
  /** number chip: add / remove that image from the group (the last one stays) */
  const toggleEdit = (id) => {
    const cur = editIdsRef.current;
    if (cur.includes(id)) {
      if (cur.length > 1) pickEdit(cur.filter((x) => x !== id));
    } else pickEdit(items.filter((i) => cur.includes(i._id) || i._id === id).map((i) => i._id)); // keep image order
  };

  /** a set of jobs from the server (create / poll / text update / resume) */
  const loadSet = (list, { resetTexts, fresh } = {}) => {
    const sorted = byCreation(list);
    setItems(sorted);
    const first = sorted[0];
    if (first) {
      // a new set starts on image 1 (each image has its own text); otherwise keep editing the same image(s)
      const cur = editIdsRef.current;
      const kept = fresh ? [] : cur.filter((id) => sorted.some((i) => i._id === id));
      const ids = kept.length ? kept : [first._id];
      if (fresh || resetTexts || ids.length !== cur.length) pickEdit(ids, sorted);
      if (first.logoUrl !== undefined || first.iconUrl !== undefined || first.productPhotoUrl !== undefined) setAssets(assetsOf(first, first.productPhotoUrl || null));
    }
    // drop selections of images that are no longer usable
    setSelected((sel) => sel.filter((id) => sorted.some((i) => i._id === id && i.status === "done" && i.images?.finalUrl)));
  };

  // open: photo engine status + product logo / photo + the newest image set made for this post (resume where the user left)
  useEffect(() => {
    if (!open) return;
    setPrompt((p) => p || defaultPrompt(post, productName));
    setAspect(defaultAspect(post));
    checkHealth();
    getImageGenOptions().then((r) => {
      const pairs = r.data?.fontPairs || [];
      setFontPairs(pairs);
      loadFontFaces(pairs);
      const kit = r.data?.brand?.enabled ? r.data.brand : null;
      setBrandKit(kit);
      if (kit?.defaultCorner) setLogoCorner((c) => (c === "top-left" ? kit.defaultCorner : c));
    }).catch(() => { });
    const product = products?.find?.((p) => p._id === productId);
    if (product) setAssets(assetsOf(product));
    if (post?._id && !batchId) {
      listAdImages({ postId: post._id })
        .then(async (r) => {
          const last = (r.data || []).find((d) => d.batchId);
          if (!last) return;
          const set = await listAdImages({ batchId: last.batchId });
          setBatchId(last.batchId);
          if (last.prompt) setPrompt(last.prompt);
          if (last.layout?.aspectRatio) setAspect(last.layout.aspectRatio);
          if (last.layout?.brand?.purpose) setPurpose(last.layout.brand.purpose);
          if (last.layout?.brand?.logoCorner) setLogoCorner(last.layout.brand.logoCorner);
          loadSet(set.data || [], { fresh: true });
        })
        .catch(() => { });
    }
  }, [open, post?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = items.some((i) => i.status === "generating");

  // poll the set while any image is still being made
  useEffect(() => {
    if (!open || !batchId || !pending) return;
    const t = setInterval(() => {
      listAdImages({ batchId }).then((r) => loadSet(r.data || [])).catch(() => { });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [open, batchId, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  // ── derived ──
  const modesAll = health?.modes?.length ? health.modes : DEFAULT_MODES;
  const nonSketch = modesAll.filter((m) => m.value !== "sketch");
  const modes = nonSketch.length ? nonSketch : modesAll; // sketch only when it is the engine's only mode (local SD)
  const hasMode = (m) => modes.some((x) => x.value === m);
  const activeMode = (hasMode(mode) && mode) || (hasMode("product") && assets.photoUrl ? "product" : hasMode("scene") ? "scene" : modes[0]?.value);
  const needsPhoto = activeMode === "product" && !assets.photoUrl;
  const ready = health?.ok;
  const engine = health?.label || "The photo engine";
  const doneItems = items.filter((i) => i.status === "done" && i.images?.finalUrl);
  const editGroup = items.filter((i) => editIds.includes(i._id)); // in image order
  const editItem = editGroup.length === 1 ? editGroup[0] : null; // one image -> text + font; a group -> font only
  const editReady = editGroup.length > 0 && editGroup.every((i) => i.status === "done");
  const allPicked = items.length > 1 && editGroup.length === items.length;
  const numbers = editGroup.map((i) => items.indexOf(i) + 1);
  const textChanged = !!editItem && !sameTexts(textsOf(editItem), texts);
  const fontDirty = !!fontPair && editGroup.some((i) => fontPairOf(i) !== fontPair);
  const textsDirty = items.length > 0 && (textChanged || fontDirty);
  const applyLabel = editItem
    ? `Update image ${numbers[0]}${textChanged && fontDirty ? " (text + font)" : fontDirty ? " (font)" : ""}`
    : allPicked ? `Update font on all ${editGroup.length} images` : `Update font on images ${numbers.join(", ")}`;
  const step = !items.length ? 0 : pending || !doneItems.length ? 1 : 2;
  const arCss = (items[0]?.layout?.aspectRatio || aspect).replace(":", " / ");

  // ── actions ──
  const generate = async () => {
    if (!prompt.trim() || !ready || needsPhoto) return;
    setBusy("create");
    setElapsed(0);
    try {
      const r = await createAdImageSet({
        prompt, productId, postId: post?._id, platform, aspectRatio: aspect, count, mode: activeMode,
        ...(brandKit ? { purpose, logoCorner } : {}),
      });
      setBatchId(r.data.batchId);
      setSelected([]);
      loadSet(r.data.items || [], { fresh: true });
      if (r.assistant?.message) toast(r.assistant.message, "default");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  /** the side panel edits what is selected in the grid: 1 image = its text + font, several = their font */
  const editSelection = (sel, fallbackId) => {
    const ids = items.filter((i) => sel.includes(i._id)).map((i) => i._id); // image order
    if (ids.length) pickEdit(ids);
    else if (fallbackId) pickEdit([fallbackId]); // nothing selected -> keep editing the image just tapped
  };
  const toggle = (item) => {
    if (item.status !== "done" || !item.images?.finalUrl) return;
    const next = !multi
      ? selected[0] === item._id ? [] : [item._id]
      : selected.includes(item._id) ? selected.filter((id) => id !== item._id) : [...selected, item._id].slice(0, 10);
    setSelected(next);
    editSelection(next, item._id);
  };
  const selectAll = () => {
    const all = doneItems.map((i) => i._id);
    setSelected(all);
    editSelection(all);
  };
  const clearSelection = () => {
    setSelected([]);
    if (editIds.length > 1) pickEdit([editIds[0]]);
  };

  /** make one image of the set again (failed, or the user wants another take of that style) */
  const redo = async (item) => {
    setItems((list) => list.map((i) => (i._id === item._id ? { ...i, status: "generating", error: null } : i)));
    setSelected((sel) => sel.filter((id) => id !== item._id));
    setElapsed(0);
    try {
      const r = await generateAdImage(item._id, { mode: item.generation?.mode || activeMode });
      setItems((list) => list.map((i) => (i._id === item._id ? r.data : i)));
    } catch (e) {
      if (e.body?.data) setItems((list) => list.map((i) => (i._id === item._id ? e.body.data : i)));
      toast(e.message, "error");
    }
  };

  /** side panel edits -> the image being edited (text + font), or every image (font). refresh = redraw the logo only */
  const applyTexts = async ({ quiet, refresh } = {}) => {
    if (!batchId) return;
    setBusy(refresh ? "logo" : "texts");
    try {
      const r = await updateAdImageSetTexts(batchId, refresh
        ? { refresh: true }
        : { texts: textChanged ? texts : undefined, fontPair: fontDirty ? fontPair : undefined, ids: editGroup.map((i) => i._id) });
      loadSet(r.data.items || [], { resetTexts: !refresh }); // a logo refresh keeps whatever is being typed
      if (r.assistant?.warnings?.length) toast(r.assistant.warnings.join(" "), "default");
      else if (!quiet) toast(r.assistant?.message || "Text updated", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  /** upload the user's logo — the backend makes its background transparent before it is used */
  const onMark = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const m = MARK;
    if (!productId) { toast("Pick a product (workspace) first", "error"); return; }
    if (!LOGO_TYPES.includes(f.type)) { toast(`Use a PNG, SVG, WebP or JPEG ${m.name}`, "error"); return; }
    setBusy("logo");
    try {
      const r = await m.upload(productId, f);
      const prod = r.data?.product;
      setAssets((a) => (prod ? assetsOf(prod, a.photoUrl) : { ...a, logoUrl: r.data?.[m.field] || null }));
      toast("Logo saved — its background is removed and it's added to every generated image", "success");
      refreshProducts?.();
    } catch (er) {
      toast(er.message, "error");
      return;
    } finally {
      setBusy("");
    }
    if (batchId && doneItems.length && !pending) await applyTexts({ quiet: true, refresh: true }); // put the new logo on the photos (keeps each image's own text)
  };

  const onRemoveMark = async () => {
    setLogoMenuOpen(false);
    if (!productId) { toast("Pick a product (workspace) first", "error"); return; }
    setBusy("logo");
    try {
      await removeProductLogo(productId);
      await removeProductIcon(productId).catch(() => { }); // an icon uploaded before the icon option was removed
      setAssets((a) => ({ ...a, logoUrl: null }));
      toast("Logo removed", "success");
      refreshProducts?.();
    } catch (er) {
      toast(er.message, "error");
      return;
    } finally {
      setBusy("");
    }
    if (batchId && doneItems.length && !pending) await applyTexts({ quiet: true, refresh: true });
  };

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!productId) { toast("Pick a product (workspace) first", "error"); return; }
    if (!PHOTO_TYPES.includes(f.type)) { toast("Use a JPEG, PNG or WebP photo of your product", "error"); return; }
    setBusy("photo");
    try {
      const r = await uploadProductPhoto(productId, f);
      setAssets((a) => ({ ...a, photoUrl: r.data?.photoUrl || a.photoUrl }));
      toast("Product photo saved — it's placed into every AI scene for this product", "success");
      setMode("product");
      refreshProducts?.();
    } catch (er) {
      toast(er.message, "error");
    } finally {
      setBusy("");
    }
  };

  const onRemovePhoto = async () => {
    setPhotoMenuOpen(false);
    if (!productId) { toast("Pick a product (workspace) first", "error"); return; }
    setBusy("photo");
    try {
      await removeProductPhoto(productId);
      setAssets((a) => ({ ...a, photoUrl: null }));
      toast("Product photo removed", "success");
      if (mode === "product") setMode("");
      refreshProducts?.();
    } catch (er) {
      toast(er.message, "error");
    } finally {
      setBusy("");
    }
  };

  const use = () => {
    const chosen = selected.map((id) => items.find((i) => i._id === id)).filter((i) => i?.images?.finalUrl);
    if (!chosen.length) return;
    onUse?.((multi ? chosen : chosen.slice(0, 1)).map(mediaOf));
    onClose?.();
  };

  const startOver = () => {
    setItems([]);
    setBatchId(null);
    setSelected([]);
  };

  const useLabel = multi
    ? selected.length ? `Use ${selected.length} image${selected.length === 1 ? "" : "s"} (carousel)` : "Select images"
    : selected.length ? "Use this image" : "Select an image";

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title="Generate images with AI" width={1080}
      footer={<>
        {items.length > 0 && <Btn onClick={startOver} disabled={!!busy} icon="pen">Edit prompt</Btn>}
        <span className="grow" />
        {step === 0 && (
          <Btn variant="primary" icon="sparkles" loading={busy === "create"} disabled={!!busy || !prompt.trim() || !ready || needsPhoto} onClick={generate}
            title={!ready ? `${engine} isn't ready yet` : needsPhoto ? "Upload your product photo first" : ""}>
            Generate {count} image{count === 1 ? "" : "s"}
          </Btn>
        )}
        {step > 0 && <>
          <Btn icon="refresh" loading={busy === "create"} disabled={!!busy || pending || !ready || needsPhoto} onClick={generate}>Generate new set</Btn>
          <Btn variant="primary" icon="check" disabled={!!busy || !selected.length} onClick={use}>{useLabel}</Btn>
        </>}
      </>}>

      {/* steps */}
      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        {STEPS.map((s, i) => (
          <Pill key={s} tone={i < step ? "green" : i === step ? "violet" : "blue"} icon={i < step ? "check" : undefined} style={{ opacity: i > step ? 0.55 : 1 }}>{i + 1}. {s}</Pill>
        ))}
        <span className="grow" />
        <EngineStatus health={health} onRetry={checkHealth} />
      </div>

      {health && !health.ok && (
        <Banner icon="alert" tone="amber" title={`${engine} isn't ready`} actions={<Btn size="sm" icon="refresh" onClick={checkHealth}>Check again</Btn>}>
          {(health.problems || []).join(" ")}
        </Banner>
      )}

      <div className={cx("sa-imggen-grid", items.length > 0 && "is-results")}>
        {/* ── left: describe OR the generated set ── */}
        <div>
          {!items.length ? (
            <div className="sa-imggen-describe">
              <Field label="What should the image show?" hint="Product, setting, props, light, mood. The headline and CTA are written for you and added as real text afterwards — don't ask for text in the photo.">
                <textarea className="sa-textarea" style={{ minHeight: 120 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!!busy}
                  placeholder="e.g. Our ghee jar on a rustic wooden kitchen counter, tulsi leaves and a brass spoon, warm morning light" />
              </Field>
              <div className="row wrap mt-s" style={{ gap: 16, alignItems: "flex-end" }}>
                <div>
                  <span className="sa-field-label">Size</span>
                  <Segmented options={ASPECTS} value={aspect} onChange={setAspect} />
                </div>
                <div>
                  <span className="sa-field-label">How many images</span>
                  <Segmented options={COUNTS} value={count} onChange={setCount} />
                </div>
              </div>
              {brandKit && (
                <div className="row wrap mt-s" style={{ gap: 16, alignItems: "flex-end" }}>
                  <div>
                    <span className="sa-field-label">Used for</span>
                    <Segmented options={PURPOSES} value={purpose} onChange={setPurpose} />
                  </div>
                  <div>
                    <span className="sa-field-label">Logo corner (same on every image)</span>
                    <Segmented options={LOGO_CORNERS} value={logoCorner} onChange={setLogoCorner} />
                  </div>
                </div>
              )}
              <div className="sa-imggen-howto small muted">
                <Icon name="sparkles" size={14} />
                <span>
                  The AI makes {count === 1 ? "one image" : `${count} images, each in a different style that fits your prompt`} (e.g. clean studio, lifestyle, bold color, moody).
                  {" "}{multi ? "This is a carousel — you can pick several (or all) of them; the order you pick is the slide order." : "Pick the one you like for your post."}
                  {" "}Your headline, CTA and logo are added on top — always spelled right.
                  {brandKit && ` Brand rules are applied: brand fonts (Poppins + Inter) and colours, your own logo (background removed) in the chosen corner.`}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                <span className="small muted">
                  {pending
                    ? <><Spinner size={12} /> Making your images… {elapsed}s — they appear as soon as each one is ready.</>
                    : multi ? "Tap to select — pick several for your carousel (the numbers are the slide order)." : "Tap the image you want for this post."}
                </span>
                {multi && doneItems.length > 1 && !pending && (
                  <button type="button" className="sa-link small" onClick={selected.length === doneItems.length ? clearSelection : selectAll}>
                    {selected.length === doneItems.length ? "Clear selection" : "Select all"}
                  </button>
                )}
              </div>
              <div className={cx("sa-imggen-results", `n${items.length}`, arCss === "9 / 16" && "is-tall")} style={{ "--ar": arCss }}>
                {items.map((item) => {
                  const done = item.status === "done" && item.images?.finalUrl;
                  const pick = selected.indexOf(item._id);
                  const on = pick !== -1;
                  return (
                    <div key={item._id} role={done ? "button" : undefined} tabIndex={done ? 0 : undefined} aria-pressed={done ? on : undefined}
                      className={cx("sa-imggen-card", on && "on", !done && "is-waiting", editIds.includes(item._id) && items.length > 1 && "is-editing")}
                      onClick={() => toggle(item)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(item))}>
                      <div className="sa-imggen-card-media">
                        {done ? <img src={item.images.finalUrl} alt={item.style || "Generated image"} />
                          : item.status === "failed" ? (
                            <div className="sa-imggen-card-msg">
                              <Icon name="alert" size={20} />
                              <small>{item.error || "This one failed."}</small>
                              <Btn size="sm" icon="refresh" onClick={(e) => { e.stopPropagation(); redo(item); }}>Try again</Btn>
                            </div>
                          ) : (
                            <div className="sa-imggen-card-msg"><Spinner size={22} /><small>Making the {item.style || "image"}…</small></div>
                          )}
                      </div>
                      {item.style && <span className="sa-imggen-card-style">{item.style}{hookOf(item) ? ` · ${hookOf(item)}` : ""}</span>}
                      {done && <span className="sa-imggen-card-tick" aria-hidden="true">{on ? (multi ? pick + 1 : <Icon name="check" size={14} />) : null}</span>}
                      {done && (
                        <span className="sa-imggen-card-acts">
                          <a href={item.images.finalUrl} target="_blank" rel="noreferrer" title="Open full size" onClick={(e) => e.stopPropagation()}><Icon name="expand" size={14} /></a>
                          <button type="button" title="Make this style again" disabled={!!busy || !ready} onClick={(e) => { e.stopPropagation(); redo(item); }}><Icon name="refresh" size={14} /></button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── right: texts (after generating) + how the photo is made + product photo + logo ── */}
        <div className="sa-imggen-side">
          {items.length > 0 && (
            <>
              {items.length > 1 && (
                <div className="sa-field">
                  <span className="sa-field-label">Edit</span>
                  <div className="sa-imggen-targets" role="group" aria-label="Which images to edit">
                    {items.map((it, i) => (
                      <button key={it._id} type="button" aria-pressed={editIds.includes(it._id)} disabled={!!busy}
                        className={cx("sa-imggen-target", editIds.includes(it._id) && "on")} onClick={() => toggleEdit(it._id)}
                        title={`${hookOf(it) ? `${it.style} — ${hookOf(it)} hook. ` : ""}Tap to add / remove this image`}>
                        <b>{i + 1}</b> {it.style || "Image"}
                      </button>
                    ))}
                    <button type="button" aria-pressed={allPicked} disabled={!!busy}
                      className={cx("sa-imggen-target", allPicked && "on")}
                      onClick={() => pickEdit(allPicked ? [items[0]._id] : items.map((i) => i._id))}>{allPicked ? "Only image 1" : "All"}</button>
                  </div>
                  <small className="muted">
                    {editItem ? `Editing image ${numbers[0]}: its text + font.${multi ? " Select more images (or tap more numbers) to change their font together." : " Tap more numbers to change the font of several images at once."}`
                      : `Editing images ${numbers.join(", ")} together: font only (each image keeps its own text).`}
                  </small>
                </div>
              )}
              {editItem ? (
                <>
                  {hookOf(editItem) && <p className="small muted" style={{ margin: 0 }}>Hook: <b className="strong">{hookOf(editItem)}</b> — every image has its own message.</p>}
                  <Field label="Headline" right={<small className="muted">{texts.headline.length}/{LIMITS.headline}</small>}>
                    <input className="sa-input" maxLength={LIMITS.headline} value={texts.headline} onChange={(e) => setTexts({ ...texts, headline: e.target.value })} disabled={!!busy} />
                  </Field>
                  <Field label="Subline" right={<small className="muted">{texts.subline.length}/{LIMITS.subline}</small>}>
                    <input className="sa-input" maxLength={LIMITS.subline} value={texts.subline} onChange={(e) => setTexts({ ...texts, subline: e.target.value })} disabled={!!busy} />
                  </Field>
                  <Field label="Button (CTA)" right={<small className="muted">{texts.cta.length}/{LIMITS.cta}</small>}>
                    <input className="sa-input" maxLength={LIMITS.cta} value={texts.cta} onChange={(e) => setTexts({ ...texts, cta: e.target.value })} disabled={!!busy} />
                  </Field>
                </>
              ) : (
                !fontPair && fontPairs.length > 1 && <p className="small muted" style={{ margin: 0 }}>These images use different fonts right now — pick one for all of them.</p>
              )}
              {fontPairs.length > 1 && ( /* brand kit = one fixed font system -> no picker */
                <div className="sa-field">
                  <span className="sa-field-label">Font</span>
                  <div className="sa-imggen-fonts" role="radiogroup" aria-label="Font">
                    {fontPairs.map((f) => (
                      <button key={f.value} type="button" role="radio" aria-checked={fontPair === f.value} disabled={!!busy || !editReady}
                        className={cx("sa-imggen-font", fontPair === f.value && "on")} onClick={() => setFontPair(f.value)} title={f.mood}>
                        <span className="sa-imggen-font-aa" style={{ fontFamily: `"${f.heading.family}", sans-serif`, fontWeight: f.heading.weight }}>Aa</span>
                        <small style={{ fontFamily: `"${f.body.family}", sans-serif` }}>{f.label}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {textsDirty && (
                <Btn size="sm" variant="soft" icon="refresh" loading={busy === "texts"} disabled={!!busy || !editReady} onClick={() => applyTexts()}
                  title={editReady ? "" : editItem ? "Wait until this image is ready" : "Wait until these images are ready"}>{applyLabel}</Btn>
              )}
              <p className="small muted" style={{ margin: 0 }}><b className="strong">Prompt:</b> {items[0]?.prompt}</p>
            </>
          )}

          {!items.length && (
            <div className="sa-field">
              <span className="sa-field-label">How should the images be made?</span>
              <div className="sa-imggen-modes" role="radiogroup">
                {modes.map((m) => (
                  <button key={m.value} type="button" role="radio" aria-checked={activeMode === m.value} disabled={!!busy}
                    className={cx("sa-imggen-mode", activeMode === m.value && "on")} onClick={() => setMode(m.value)}>
                    <b>{m.label}</b>
                    <small>{MODE_HINT[m.value]}{m.cost ? ` · ${m.cost} per image` : m.credits ? ` · ~${m.credits} credits per image` : ""}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasMode("product") && !items.length && (
            <div className={cx("sa-imggen-logo", needsPhoto && "is-needed")}>
              {assets.photoUrl ? (
                <img src={assets.photoUrl} alt="Product" style={{ height: 44, width: 44, objectFit: "cover", borderRadius: 8 }} />
              ) : (
                <span className="sa-ic tone-violet"><Icon name="imagePlus" size={18} /></span>
              )}
              <span className="grow small">
                {assets.photoUrl
                  ? "Your product photo — placed into every scene exactly as photographed."
                  : "Upload a clear photo of your product (front of the pack, plain background, 1000+ px) so the label comes out exact."}
              </span>
              {assets.photoUrl ? (
                <div className="row" style={{ gap: 6, position: "relative" }} ref={photoMenuRef}>
                  <Btn size="sm" icon="upload" loading={busy === "photo"} disabled={!!busy} onClick={() => photoRef.current?.click()}>Change</Btn>
                  <button type="button" className="sa-action-dot-btn" title="Photo options" aria-label="Photo options" disabled={!!busy} onClick={() => setPhotoMenuOpen((o) => !o)}>
                    <Icon name="more" size={16} />
                  </button>
                  {photoMenuOpen && (
                    <div className="sa-dot-menu-popover">
                      <button type="button" onClick={() => { setPhotoMenuOpen(false); photoRef.current?.click(); }}><Icon name="upload" size={14} /><span>Upload new photo</span></button>
                      <button type="button" className="danger" onClick={onRemovePhoto}><Icon name="trash" size={14} /><span>Delete photo</span></button>
                    </div>
                  )}
                </div>
              ) : (
                <Btn size="sm" icon="upload" loading={busy === "photo"} disabled={!!busy} onClick={() => photoRef.current?.click()}>Upload photo</Btn>
              )}
              <input ref={photoRef} type="file" hidden accept={PHOTO_TYPES.join(",")} onChange={onPhoto} />
            </div>
          )}

          {/* brand mark: the user's logo */}
          <div>
            <span className="sa-field-label">Logo</span>
          </div>
          {(() => {
            const m = MARK;
            const url = assets.logoUrl;
            const Name = "Logo";
            return (
              <div className="sa-imggen-logo">
                {url ? (
                  <img src={url} alt={Name} style={{ height: 32, width: 56, objectFit: "contain" }} />
                ) : (
                  <span className="sa-ic tone-violet"><Icon name="image" size={18} /></span>
                )}
                <span className="grow small">
                  {url
                    ? "Your logo is added to every image — its background is removed automatically."
                    : "No logo yet — upload one (PNG, SVG, WebP or JPEG). A white or coloured background is removed automatically."}
                </span>
                {url ? (
                  <div className="row" style={{ gap: 6, position: "relative" }} ref={logoMenuRef}>
                    <Btn size="sm" icon="upload" loading={busy === "logo"} disabled={!!busy || pending} onClick={() => logoRef.current?.click()}>Change</Btn>
                    <button type="button" className="sa-action-dot-btn" title={`${Name} options`} aria-label={`${Name} options`} disabled={!!busy || pending} onClick={() => setLogoMenuOpen((o) => !o)}>
                      <Icon name="more" size={16} />
                    </button>
                    {logoMenuOpen && (
                      <div className="sa-dot-menu-popover">
                        <button type="button" onClick={() => { setLogoMenuOpen(false); logoRef.current?.click(); }}><Icon name="upload" size={14} /><span>Upload new {m.name}</span></button>
                        <button type="button" className="danger" onClick={onRemoveMark}><Icon name="trash" size={14} /><span>Delete {m.name}</span></button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Btn size="sm" icon="upload" loading={busy === "logo"} disabled={!!busy || pending} onClick={() => logoRef.current?.click()}>Upload {m.name}</Btn>
                )}
                <input ref={logoRef} type="file" hidden accept={LOGO_TYPES.join(",")} onChange={onMark} />
              </div>
            );
          })()}

          {items.length > 0 && !pending && (
            <p className="small muted row" style={{ margin: 0, gap: 6 }}>
              <Icon name={multi ? "carousel" : "image"} size={14} />
              {multi ? `Carousel: ${selected.length} of ${doneItems.length} selected (2–10 needed to publish).` : selected.length ? "1 image selected." : "Image post: select one image."}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EngineStatus({ health, onRetry }) {
  const name = health?.label || "Photo engine";
  if (!health) return <span className="row small muted" style={{ gap: 6 }}><Spinner size={14} /> Checking the photo engine…</span>;
  if (health.ok) return null; // engine is ready — no badge needed in the UI
  return <button type="button" className="sa-link small" onClick={onRetry} title={(health.problems || []).join(" ")}><Pill tone="amber" icon="alert">{name} not ready</Pill></button>;
}
