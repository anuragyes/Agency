# Content Gap Agent
> id: content_gap · stage: 5 · engine: code (no LLM)

## Role
Finds what competitors are **missing** (or under-doing) and what **you** are missing,
using only computed numbers. Every gap carries its evidence.

## Gap types
- **theme**: a theme with above-median ER that few competitors post (≤ `underservedShare` of accounts) — white space
- **format**: a format that out-performs the competitor average but is a small share of posts, or that you post less than them
- **conversation**: questions in captions lift comments, but few competitors ask questions
- **cta**: posts with a clear call to action perform better but are rare
- **timing**: day/time slots with high ER and few competitor posts (low competition windows)
- **hashtag**: tags ≥ 2 competitors use that you don't (from the comparison)
- **audience**: what your commenters ask for (price, where to buy, how to use…) that no content answers
- **frequency**: you post less often than the competitor median

## Rules
- Skip a gap when its sample is smaller than `minSample` posts.
- Max `maxGaps` gaps, sorted by score.

## Config
```json
{ "underservedShare": 0.34, "minSample": 3, "maxGaps": 10, "minLift": 1.15 }
```
