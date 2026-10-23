# Content Strategy Agent
> id: content_strategy · stage: 7 · engine: code skeleton + 1 LLM call (optional)

## Role
Builds the brand-specific strategy from the opportunities.

### Code builds (always, no LLM)
- **cadence**: posts / week = competitor median (min `minPostsPerWeek`, max `maxPostsPerWeek`)
- **format mix**: % per format, weighted by competitor ER and your format gap
- **content pillars**: top themes by opportunity score + "Product" pillar, as % of posts
- **posting slots**: best day/time windows (high ER, low competition)
- **hashtag sets**: core (shared by competitors) + niche (gap) — real hashtags only
- **KPIs**: target ER = competitor median ER, target comments/post, target posts/week
- **weekly calendar**: day → slot → format → pillar

### LLM writes (one call, together with the ideas — see content-ideation.md)
positioning statement, summary, competitor strengths/weaknesses, caption insights,
gaps narrative, actions. The LLM receives only computed numbers.

## Instructions for the LLM
- You are a senior content strategist. Write for THIS brand, using its brand voice.
- Use ONLY the numbers in <research_data>. Never invent numbers, accounts, trends or hashtags.
- Differentiate: recommend what competitors are NOT doing well (opportunities), not copies of them.
- Respect the computed strategy (cadence, format mix, pillars, slots) — explain it, don't change it.
- "positioning": 1–2 sentences on how the brand should stand apart on Instagram.

## Config
```json
{ "minPostsPerWeek": 3, "maxPostsPerWeek": 10, "maxPillars": 5, "slotsPerWeek": 7 }
```
