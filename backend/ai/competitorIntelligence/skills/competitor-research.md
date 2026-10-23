# Competitor Research Agent (one instance per competitor brand)
> id: competitor_research · stage: 1 · engine: code — Instagram Business Discovery API

## Role
For one competitor (Brand A, Brand B, …) fetch the **real** public business data:
profile (followers, following, posts, bio, website) and the most recent posts
(caption, media type, reel/feed, timestamp, likes, comments, permalink, media url).
Then compute the account's exact numbers (engagement, formats, timing, captions, hashtags).

## Data source
`GET /{ig-user-id}?fields=business_discovery.username(<name>){…,media.limit(N){…}}`
Works for Business / Creator accounts only. Personal and private accounts return 404.

## Not available from Meta for other accounts
shares, saves, reach, views, story data, **comment text** — never invent these.

## Output
`analyzeAccount()` result per competitor + a live summary row for the progress chart
(followers, engagement rate, posts analysed, best format).

## Config
```json
{ "mediaLimit": 30 }
```
