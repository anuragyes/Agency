# Competitor Performance Agent (Competitor Intelligence)
> id: competitor_performance · stage: 4 · engine: code (no LLM)

## Role
Combines Post Insights + Audience Insights into one performance picture per account and
finds patterns and outliers.

## Per account
- engagement rate, avg engagement, posts / week, followers
- **consistency** = 100 − coefficient of variation of per-post ER (capped 0–100)
- **momentum** = avg ER of the newer half of posts vs the older half (%)
- conversation rate (comments per 100 likes)
- outlier ("viral") posts from the Post Analysis Agent
- **performance score 0–100** = weighted percentile ranks (weights below)
- tier: Leader (top quartile) · Challenger · Follower

## Patterns
- what the top-quartile accounts do more of than the rest (formats, themes, posting rate,
  questions, CTAs) — the difference in percentage points is the evidence.

## Config
```json
{
  "weights": { "engagementRate": 40, "momentum": 15, "frequency": 15, "consistency": 15, "conversation": 15 },
  "minPostsForMomentum": 6
}
```
