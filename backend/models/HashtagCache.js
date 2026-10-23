// ─────────────────────────────────────────────────────────────
// models/HashtagCache.js — remembers Instagram hashtag ids.
//
// WHY: Meta allows only 30 UNIQUE hashtag searches (ig_hashtag_search) per
// Instagram account in a rolling 7 days. A hashtag's id never changes, so once
// we know it we never search it again -> repeat research costs 0 quota.
// "searchedAt" = when we spent quota on it (used to count the weekly limit).
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const HashtagCacheSchema = new mongoose.Schema(
    {
        hashtag: { type: String, required: true, unique: true, lowercase: true, trim: true }, // without "#"
        hashtagId: { type: String, default: null },   // null = Instagram has no such hashtag
        notFound: { type: Boolean, default: false },
        searchedAt: { type: Date, default: Date.now, index: true },
        lastUsedAt: { type: Date, index: true },        // last time any research used it -> the pre-warm job refreshes these
    },
    { timestamps: true }
);

module.exports = mongoose.models.HashtagCache || mongoose.model("HashtagCache", HashtagCacheSchema);
