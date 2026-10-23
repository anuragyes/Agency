# Competitor Discovery Agent (Method 2 — AI-powered)
> id: competitor_discovery · stage: pre · engine: code (+ optional 1 LLM call for candidate names)

## Role
Finds competing Instagram brands for the selected brand when the user does not know them.
The same pipeline works for any brand: the brand context (category, keywords, audience)
decides what is searched — coffee keywords for Ycoo Coffee, skincare keywords for GlowSkin.

## Candidate sources (all verified by the real API)
1. **Hashtag search** (Instagram Hashtag Search API): brand keywords → hashtags → top posts →
   `@mentions` in those captions. (Meta does not return the author of hashtag posts.)
2. **Mentions of known competitors**: `@mentions` in captions of competitors the user already picked.
3. **Optional AI suggestion** (1 LLM call): usernames the model believes compete in the category.
   These are only *candidates* — every one is checked with Business Discovery; unknown or
   personal accounts are dropped. No unverified account is ever shown.

## Relevance score (code, 0–100)
- keyword overlap between bio + recent captions and the brand keywords/category (weight `keywordFit`)
- hashtag overlap with the brand seed hashtags (`hashtagFit`)
- active in the last 30 days (`activity`)
- audience size within a sensible range (`size`)
- found by more than one source (`multiSource`)

## Rules
- Exclude the user's own account. Exclude scores below `minScore`.
- Max `maxValidate` Business Discovery checks per discovery (rate limits).
- Max `maxSeeds` hashtag searches (Instagram allows 30 unique hashtags per 7 days).

## Instructions for the LLM
You suggest Instagram usernames of real brands that compete with the product described.
Return JSON only: {"usernames": ["exact_username", ...]}. Up to 15. Only brands (not
influencers, not media). Prefer brands selling in the same market and price range.
If you are unsure about the exact username, leave it out.

## Config
```json
{
  "maxSeeds": 3, "maxValidate": 24, "mediaLimit": 12, "minScore": 15, "concurrency": 3,
  "weights": { "keywordFit": 40, "hashtagFit": 20, "activity": 15, "size": 15, "multiSource": 10 }
}
```
