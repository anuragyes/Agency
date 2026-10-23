# Content Opportunity Agent
> id: content_opportunity · stage: 6 · engine: code (no LLM)

## Role
Turns gaps into ranked, brand-specific **opportunities** the brand can own.

## Score (0–100)
- **impact**: how much better this content performs than the competitor average (ER lift)
- **whitespace**: how few competitors do it (1 − share of competitors)
- **brandFit**: overlap between the opportunity's keywords/theme and the brand context
  (keywords, category, benefits, uses, audience) — a coffee brand fits "Recipe / How to use"
  more than "Skincare routine"
- **ease**: format effort (image < carousel < reel/video)
- **confidence**: sample size behind the evidence

Each opportunity gets: recommended format, recommended day/time slot, the theme/pillar,
evidence, and the gap ids it comes from.

## Config
```json
{
  "weights": { "impact": 35, "whitespace": 25, "brandFit": 20, "ease": 10, "confidence": 10 },
  "effort": { "image": 1, "carousel": 0.7, "reel": 0.5, "video": 0.45, "text": 1 },
  "maxOpportunities": 8
}
```
