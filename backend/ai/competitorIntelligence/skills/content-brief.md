# Content Brief Agent
> id: content_brief · stage: 9 · engine: code (no LLM)

## Role
Turns each idea into a production-ready **creative brief** the Image / Video agents and a
human designer can follow.

## Brief contents
objective · target audience (Brand Brain) · format spec (ratio, length, slides) ·
structure (hook → body → CTA, or slide-by-slide outline) · caption guidance (target length
from top competitor posts, include a question when the conversation gap applies, CTA) ·
hashtags (real only, `hashtagsPerPost`) · posting slot · visual direction · KPI targets ·
reference posts (real competitor permalinks of the same theme/format) · do / don't.

## Config
```json
{
  "hashtagsPerPost": [5, 12],
  "formats": {
    "reel":     { "ratio": "9:16", "length": "15–30 s", "structure": ["0–2 s: hook on screen + spoken", "2–20 s: show the product / the answer", "last 3 s: CTA + brand"] },
    "carousel": { "ratio": "4:5", "slides": "5–8", "structure": ["Slide 1: hook headline", "Slides 2–6: one point per slide", "Last slide: CTA + save/share prompt"] },
    "image":    { "ratio": "4:5", "structure": ["One clear product visual", "Short headline on image (≤ 6 words)", "Caption carries the story + CTA"] },
    "video":    { "ratio": "4:5 or 9:16", "length": "15–45 s", "structure": ["Hook in first 2 s", "Demonstration", "CTA"] }
  }
}
```
