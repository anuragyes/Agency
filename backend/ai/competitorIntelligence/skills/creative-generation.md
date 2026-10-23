# Creative Generation — Image Agent & Video Agent
> id: creative_generation · stage: 10 · engine: existing Studio pipeline (after approval)

## Role
After the customer approves the report, each selected brief becomes a draft post through the
existing Studio pipeline: content brief → post writer (caption, hashtags from the brief) →
**Image Agent** (AI product ad image: layout → render → typography + logo) for image/carousel,
**Video Agent** (reel script + cover; footage uploaded or generated) for reels.

## Rules
- Only approved reports can create creatives.
- Hashtags come from the brief (real competitor/hashtag data only).
- Every creative goes back through Quality Check and the Editor before publishing.

## Config
```json
{ "imageFormats": ["image", "carousel"], "videoFormats": ["reel", "video"] }
```
