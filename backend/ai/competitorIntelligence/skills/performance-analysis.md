# Performance Analysis + Strategy Improvement Agent
> id: performance_analysis, strategy_improvement · stage: 14–15 · engine: code — Instagram Insights API

## Role
After posts created from this report are published, reads their real results from the
Instagram Graph API (likes, comments, and — for your own media — reach, saves, shares, views)
and compares them with the strategy KPIs and the competitor benchmark.

## Strategy improvement rules (code)
- post ER ≥ target → **double down** on that pillar/format (raise its share by `shift` pts)
- post ER < `underperformRatio` × target → **reduce** that pillar/format and test the next opportunity
- comments below target → add a question / CTA to captions
- saves high vs likes → more educational carousels

## Config
```json
{ "underperformRatio": 0.7, "shift": 10, "insightMetrics": ["reach", "saved", "shares", "views", "total_interactions"] }
```
