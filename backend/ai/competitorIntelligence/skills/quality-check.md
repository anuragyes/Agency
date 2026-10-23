# Quality Check Agent (Quality Control)
> id: quality_check · stage: 11 · engine: code (no LLM)

## Role
Validates every idea + brief before it is shown for approval. Each check passes or fails
with a reason; the score is the weighted share of passed checks.

## Checks
- **grounded hashtags**: every hashtag appears in real collected posts
- **hashtag count** within the allowed range
- **hook length** ≤ `maxHookChars`
- **has evidence** (basedOn / opportunity evidence)
- **no competitor names** (usernames / brand names) in hook, title or angle
- **valid format** and a posting slot
- **unique** — title not too similar to another idea (Jaccard ≥ `maxSimilarity`)
- **has CTA** in the brief structure

## Config
```json
{ "passScore": 70, "maxHookChars": 125, "maxSimilarity": 0.6,
  "weights": { "groundedHashtags": 20, "hashtagCount": 10, "hookLength": 10, "evidence": 20, "noCompetitorNames": 15, "format": 10, "unique": 10, "cta": 5 } }
```
