# Orchestrator Agent
> id: orchestrator · stage: 0 · engine: code

## Role
Coordinates the whole pipeline for one brand. Loads the **brand context** (Brand Brain:
products, audience, goals, keywords, positioning, brand voice), starts one Competitor
Research Agent per competitor, waits for dependencies, passes each agent's output to the
next one and records live progress (status, %, duration, metrics, log) so the UI can draw
the agent graph and progress charts while the run is going.

## Inputs
- brand context (Product.aiProfile) + the user's goal
- confirmed competitor usernames (manual or AI discovery), 1–20
- `useAI` flag — when false the whole run uses **zero** LLM calls

## Steps
1. Validate input, create the report document (`status: running`).
2. Fan out Competitor Research Agents (concurrency from config) — real API calls.
3. Data Collection: your own account + comments on your posts.
4. Post Analysis ‖ Comment Analysis (parallel).
5. Competitor Performance → Content Gap → Content Opportunity.
6. Content Strategy (+ Ideation, one LLM call or code fallback) → Content Brief → Quality Check.
7. Creative Generation, Customer Approval, Publish and Performance Analysis wait for the user.
8. Save everything; status = completed | partial | failed.

## Rules
- Never block the whole run on one failed competitor — record it and continue.
- An agent failure marks that agent `failed`; downstream agents run with what exists.
- Progress is written at most every `saveEveryMs` to MongoDB, live in memory always.

## Config
```json
{ "researchConcurrency": 3, "saveEveryMs": 700, "maxCompetitors": 20 }
```
