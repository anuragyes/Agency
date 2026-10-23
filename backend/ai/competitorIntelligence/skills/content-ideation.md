# Content Ideation Agent (Content Creation — ideas & captions)
> id: content_ideation · stage: 8 · engine: same LLM call as strategy, code fallback

## Role
Generates original post ideas for the brand. Each idea maps to one opportunity and one pillar.

## With AI (useAI = true)
The single LLM call returns 4–6 ideas: title, format, hook (first line / first 2 seconds),
angle (what it says about the product), hashtags (must be real), basedOn (the evidence),
opportunityId. Code removes unknown hashtags and unknown opportunity ids.

## Without AI (or if the call fails)
Code builds one idea per top opportunity from the title / hook / angle templates below, filled
with the brand name and topic (first brand keyword that is not part of the brand name). Nothing is invented: the evidence is the opportunity's evidence.

## Instructions for the LLM
- Ideas must be ORIGINAL for the brand — never copy a competitor caption or name a competitor.
- One idea per opportunity where possible; use the opportunity's recommended format.
- Hooks under 120 characters. Hinglish is fine if the brand voice allows it.

## Config
```json
{
  "maxIdeas": 6,
  "titles": {
    "Educational": "{topic} myths vs facts",
    "Recipe / How to use": "3 ways to enjoy {brand} {topic}",
    "Product showcase": "{brand} {topic}: what's inside",
    "Offer / Promo": "{brand} weekly drop",
    "Giveaway / Contest": "{brand} community giveaway",
    "Behind the scenes": "From source to cup: how {brand} is made",
    "Customer / User-Generated Content": "Real {brand} customers, real moments",
    "Festive / Seasonal": "{brand} seasonal special",
    "Lifestyle / Mood": "Your daily {topic} ritual",
    "Entertainment / Trend": "Relatable {topic} moments",
    "Collab / Influencer": "Creator tries {brand}",
    "Sustainability / Values": "What {brand} stands for",
    "Product": "Why {brand} is different",
    "Other": "Your {topic} questions, answered"
  },
  "hookStyles": {
    "POV": "POV: {brand} just became your {topic} ritual",
    "How-to": "How to get café-style {topic} at home with {brand}",
    "Number / list": "5 {topic} mistakes you're probably making",
    "Question": "Be honest — how do you take your {topic}?",
    "Announcement": "New from {brand}: the {topic} you asked for",
    "Emoji opener": "☕ Your {topic} upgrade starts here"
  },
  "angles": {
    "conversation": "End the caption with one direct question so people reply in the comments.",
    "cta": "Close with one clear call to action (save, share, DM or shop).",
    "timing": "Publish in the recommended low-competition window.",
    "hashtag": "Use the category hashtags competitors share so new people find you.",
    "audience": "Answer the question your own commenters ask most, plainly.",
    "frequency": "Part of a consistent weekly series — same day, same slot.",
    "format": "Built for the format competitors under-use.",
    "theme": "A theme few competitors cover — make it yours.",
    "hook": "Use the proven hook style in the first line / first 2 seconds."
  },
  "hooks": {
    "Educational": "3 things nobody tells you about {topic}",
    "Recipe / How to use": "Your {brand} {topic} in 30 seconds — save this",
    "Product showcase": "Meet the {brand} {topic} you've been asking for",
    "Offer / Promo": "This week only: {brand} {topic}",
    "Giveaway / Contest": "Win {brand} {topic} — here's how",
    "Behind the scenes": "How your {brand} {topic} is really made",
    "Customer / User-Generated Content": "You said it best: real {brand} moments",
    "Festive / Seasonal": "The {brand} way to celebrate this season",
    "Lifestyle / Mood": "Your {topic} ritual, upgraded",
    "Entertainment / Trend": "POV: you finally found {brand}",
    "Collab / Influencer": "We asked a creator to try {brand} {topic}",
    "Sustainability / Values": "What goes into (and stays out of) {brand}",
    "Product": "Why {brand} {topic} is different",
    "Other": "The {brand} {topic} question we get every day"
  }
}
```
