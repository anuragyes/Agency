# Competitor Intelligence — agent skill files

Each `*.md` file here is the **instruction + config file for one agent** of the
AI Competitor Intelligence & Content Strategy pipeline (`services/competitorIntelligence`).

- The text tells the agent (and you) what its job is, what it reads, what it writes and its rules.
- The ```json block under `## Config` is **read by the code at run time** (`skillLoader.js`).
  Change a threshold or a keyword list here and the agent changes — no code edit needed.
- `engine: code` agents never call an LLM. They work on real Instagram Graph API data.
- `engine: llm` agents (only Content Strategy + Ideation, **one call in total**) use the
  text under `## Instructions for the LLM` as their system rules, and their output is
  validated in code (real hashtags only, real usernames only, evidence required).

| File | Agent | Engine |
|------|-------|--------|
| orchestrator.md | Orchestrator | code |
| competitor-discovery.md | Competitor Discovery (Method 2) | code + optional 1 LLM call (candidates only, all verified by the API) |
| competitor-research.md | Competitor Research (one per brand) | code — Business Discovery API |
| data-collection.md | Data Collection (your account + your comments) | code — Instagram Graph API |
| post-analysis.md | Post Analysis | code |
| comment-analysis.md | Comment Analysis | code |
| competitor-performance.md | Competitor Performance | code |
| content-gap.md | Content Gap | code |
| content-opportunity.md | Content Opportunity | code |
| content-strategy.md | Content Strategy | code skeleton + 1 LLM call (optional) |
| content-ideation.md | Content Ideation | same LLM call, code fallback |
| content-brief.md | Content Brief | code |
| creative-generation.md | Image Agent / Video Agent | existing Studio + image generator (after approval) |
| quality-check.md | Quality Check | code |
| approval-publish.md | Customer Approval + Publish / Schedule | human + Instagram Publishing API |
| performance-analysis.md | Performance Analysis + Strategy Improvement | code — Instagram Insights API |
