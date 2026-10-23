// ─────────────────────────────────────────────────────────────
// models/HashtagMediaCache.js — the posts we already fetched for a hashtag
//
// One document per hashtag + edge ("top_media" | "recent_media").
// WHY: before, this cache lived only in memory -> every server restart (node --watch
// restarts on every file save) threw it away and the next search waited minutes again.
//
//   fetchedAt  when the data came from Meta (freshness is checked in code)
//   expiresAt  MongoDB deletes the document by itself after this time (TTL index)
//   after      Meta's paging cursor -> we can CONTINUE paging later instead of starting again
//   complete   true = no more pages (or the page cap was reached)
//   withMediaUrl  true = posts carry media_url (thumbnails for the Hashtags page)
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const HashtagMediaCacheSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true }, // `${hashtagId}:${edge}`
        hashtagId: { type: String, required: true, index: true },
        edge: { type: String, enum: ["top_media", "recent_media"], required: true },
        media: { type: Array, default: [] },
        withMediaUrl: { type: Boolean, default: false },
        fields: String,
        limit: Number,
        after: { type: String, default: null },
        pages: { type: Number, default: 0 },
        complete: { type: Boolean, default: false },
        fetchedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
    },
    { minimize: false }
);

HashtagMediaCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.HashtagMediaCache || mongoose.model("HashtagMediaCache", HashtagMediaCacheSchema);
