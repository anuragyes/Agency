# Post Analysis Agent
> id: post_analysis · stage: 3 · engine: code (no LLM)

## Role
Reads every collected competitor post and tags it, then measures what kind of content
performs. Because accounts have very different sizes, performance is compared with
**engagement rate per post** = (likes + comments) ÷ followers × 100.

## What it extracts per post
- format: reel · carousel · image · video
- content theme(s) / pillar — keyword lexicon below (+ the brand's own keywords as "Product")
- hook = first line of the caption, and its hook type (question, number/list, POV, how-to, emoji, statement)
- caption length bucket, hashtag-count bucket, has question, has CTA
- posting day + 3-hour slot (report timezone)

## Post insights it produces
- theme performance (posts, share of posts, how many competitors use it, avg ER per post)
- format performance and format mix per account
- hook type performance, caption-length performance, hashtag-count performance
- day × time heatmap (posts and avg ER per slot)
- outlier posts: ER ≥ `outlierMultiplier` × that account's median

## Rules
- Hashtags are removed before reading caption text.
- A post can have several themes; with no match it is "Other".
- Never use a bucket with fewer than `minPostsPerBucket` posts as evidence.

## Config
```json
{
  "outlierMultiplier": 2.5,
  "minPostsPerBucket": 3,
  "captionBuckets": [[0, 60, "Short (<60)"], [60, 200, "Medium (60–200)"], [200, 600, "Long (200–600)"], [600, 100000, "Very long (600+)"]],
  "hashtagBuckets": [[0, 1, "0"], [1, 4, "1–3"], [4, 11, "4–10"], [11, 100, "11+"]],
  "themes": {
    "Educational": ["how to", "tips", "tip", "guide", "benefits", "learn", "facts", "did you know", "why ", "vs", "myth", "steps", "explained", "science", "know"],
    "Recipe / How to use": ["recipe", "brew", "make", "homemade", "routine", "how to use", "method", "ingredients", "step by step", "pour", "mix", "apply"],
    "Product showcase": ["new", "launch", "introducing", "meet", "available", "pack", "flavour", "flavor", "range", "collection", "now in", "restock", "bestseller", "shop"],
    "Offer / Promo": ["offer", "sale", "discount", "% off", "off ", "code", "deal", "free shipping", "buy 1", "limited", "price drop", "flat"],
    "Giveaway / Contest": ["giveaway", "contest", "win", "winner", "tag 3", "tag your", "participate"],
    "Behind the scenes": ["behind", "process", "farm", "team", "sourcing", "crafted", "journey", "story", "founder", "roast", "lab", "factory", "made by"],
    "Customer / User-Generated Content": ["review", "customer", "repost", "feedback", "testimonial", "thank you", "loved by", "community", "you said", "tag us"],
    "Festive / Seasonal": ["diwali", "holi", "christmas", "new year", "festive", "festival", "eid", "rakhi", "valentine", "mother's day", "father's day", "summer", "winter", "monsoon", "rainy"],
    "Lifestyle / Mood": ["morning", "mood", "vibes", "weekend", "self care", "selfcare", "ritual", "aesthetic", "cozy", "chill", "monday", "everyday"],
    "Entertainment / Trend": ["pov", "when you", "meme", "trend", "challenge", "funny", "relatable", "be like", "plot twist", "nobody:"],
    "Collab / Influencer": ["collab", "x @", "partnered", "with @", "featuring", "ft.", "in partnership"],
    "Sustainability / Values": ["sustainable", "eco", "plastic free", "organic", "ethical", "fair trade", "cruelty free", "vegan", "natural", "clean"]
  }
}
```
