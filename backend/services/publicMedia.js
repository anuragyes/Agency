// ─────────────────────────────────────────────────────────────
// publicMedia.js — make a post's media downloadable for Instagram / Facebook right before approve / publish
//   Cloudinary set up  -> files still on this server (http://localhost:5000/uploads/...) are uploaded to Cloudinary
//                         and the post's URLs are swapped to the permanent https links (old drafts get fixed too).
//   Not set up         -> nothing changes here (PUBLIC_BASE_URL / ngrok still works as before).
// ─────────────────────────────────────────────────────────────
const { isConfigured, isLocalUrl, moveLocalMediaToCloud, uploadBuffer } = require("./cloudStorage.js");
const { localFileFor } = require("./imageGen/imageStorage.js");

/** @returns {Promise<{ moved: number, missing: string[] }>} */
const prepareMediaForPublish = async (doc) => {
    if (!isConfigured()) return { moved: 0, missing: [] };
    const media = (doc.media || []).map((m) => (m.toObject ? m.toObject() : { ...m }));
    const r = await moveLocalMediaToCloud(media, localFileFor);
    if (r.moved) {
        doc.media = media;
        doc.markModified?.("media");
    }
    // reel cover image (Instagram)
    if (doc.coverUrl && isLocalUrl(doc.coverUrl)) {
        const file = localFileFor(doc.coverUrl);
        if (file) {
            const up = await uploadBuffer(await require("fs").promises.readFile(file), { folder: "posts", mimeType: "image/jpeg", filename: "cover.jpg" });
            doc.coverUrl = up.url;
            r.moved++;
        }
    }
    return r;
};

module.exports = { prepareMediaForPublish };
