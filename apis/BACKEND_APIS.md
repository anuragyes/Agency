# Sociva — Backend API list

Base URL (dev): `http://localhost:5000`. Every JSON response looks like `{ "success": true, "data": ... }`;
errors look like `{ "success": false, "message": "..." }`.

Legend for **Uses**:
- **DB** = MongoDB only
- **LLM** = AI model (OpenRouter or Gemini, picked by `LLM_PROVIDER` in `.env`)
- **IG API** = official Instagram / Meta Graph API (real data)
- **FB API** = official Facebook Graph API for your Page (real data)
- **Stability** = Stability AI hosted image API (default — no GPU needed)
- **SD** = your local Stable Diffusion WebUI (AUTOMATIC1111 / Forge) + ControlNet (needs an NVIDIA GPU)
- **—** = nothing external

_Last updated: 13 Oct 2026 (AI Competitor Intelligence & Content Strategy Agent added — routes #68–#72)._

---

## Quick list

| # | Method | Route | What it does | Uses | Used by (frontend) |
|---|---|---|---|---|---|
| 1 | GET | `/` | Health check | — | Topbar "API live" dot |
| 2 | GET | `/api/prompts` | Demo prompt list | — | not used |
| 3 | GET | `/uploads/...` | Serves uploaded images/videos | — | Instagram (downloads media to publish) |
| 4 | POST | `/api/products` | Product text → AI Product Profile (Brand Brain) | LLM, DB | Onboarding, ProductBrain (legacy) |
| 5 | GET | `/api/products/getProduct` | List all products | DB | Workspace switcher (store) |
| 6 | GET | `/api/products/getIdProduct/:id` | One product | DB | ProductBrain, InstagramStudio (legacy) |
| 7 | GET | `/api/hashtags/platforms` | Which hashtag platforms are live | — | Hashtags page |
| 8 | POST | `/api/hashtags/:platform/explore` | Real hashtags + real posts for your keywords | IG API, DB | Hashtags page |
| 9 | GET | `/api/hashtags/:platform/quota` | Hashtag searches used this week (x/30) | DB | Hashtags page |
| 10 | GET | `/api/competitor-research/platforms` | Which competitor platforms are live (+ maxCompetitors 20) | — | Competitor Research |
| 11 | GET | `/api/competitor-research/:platform/lookup` | Find one competitor by username or profile URL | IG API | Competitor Research (search box + "Validate profiles") |
| 12 | POST | `/api/competitor-research` | Old one-shot research → real data + AI report (waits for the result) | IG API, LLM, DB | not used now (replaced by #70) |
| 13 | GET | `/api/competitor-research/product/:productId` | Saved reports for a product | DB | Competitor Research |
| 14 | GET | `/api/competitor-research/:id` | One saved report | DB | Competitor Research |
| 15 | POST | `/api/competitor-research/:id/approve` | Approve a report | DB | Competitor Research |
| 16 | POST | `/api/competitor-research/:id/posts` | Link a draft post made from an idea (+ moves Image / Video agents forward) | DB | Competitor Research |
| 68 | GET | `/api/competitor-research/agents` | All pipeline agents + their skill (.md) files | — | Competitor Research (agent details) |
| 69 | POST | `/api/competitor-research/discover` | AI-powered competitor discovery — every account verified by the API | IG API, DB (+1 optional LLM call) | Competitor Research → AI-powered discovery |
| 70 | POST | `/api/competitor-research/pipeline` | Start the multi-agent pipeline (returns at once, runs in the background) | IG API, DB (+1 optional LLM call) | Competitor Research → Start research agents |
| 71 | GET | `/api/competitor-research/:id/progress` | Live agent status / progress / log (poll every ~1 s) | DB / memory | Competitor Research → live agent graph + charts |
| 72 | POST | `/api/competitor-research/:id/results` | Performance analysis of published posts + strategy improvements | IG API, DB | Competitor Research → Results tab |
| 73 | POST | `/api/instagram/brief/research/jobs` | Same as #19 as a background job → `{ jobId }` in ~200 ms (BullMQ queue) | Redis, IG API | AI Content Studio step 5 |
| 74 | GET | `/api/instagram/brief/research/jobs/:jobId` | Job state + per-hashtag progress + result (poll every ~1.5 s) | Redis / memory | AI Content Studio step 5 |
| 75 | POST | `/api/instagram/posts/:id/live-hashtags` | Draft → refine: swap the draft's hashtags for live research hashtags (0 tokens) | DB | AI Content Studio step 5 |
| 17 | GET | `/api/content/platforms` | Platforms + formats for the Studio | — | not used (list is in frontend) |
| 18 | POST | `/api/content/brief` | Your prompt → optimized JSON brief | LLM, DB | AI Content Studio, Competitor Research |
| 19 | POST | `/api/instagram/brief/research` | Live hashtags for a brief (no LLM) | IG API | AI Content Studio |
| 20 | POST | `/api/instagram/posts/generate` | AI writes a post / reel / carousel draft | LLM, DB (+IG API) | Studio, Competitor Research, InstagramStudio (legacy) |
| 21 | GET | `/api/instagram/posts` | List drafts + published posts | DB | Pipeline, Calendar, Dashboard (store) |
| 22 | GET | `/api/instagram/posts/:id` | One post | DB | Content Editor |
| 23 | PATCH | `/api/instagram/posts/:id` | Save manual edits | DB | Content Editor |
| 24 | POST | `/api/instagram/posts/:id/revise` | AI rewrites the post from your prompt | LLM, DB | Content Editor |
| 25 | POST | `/api/instagram/posts/:id/approve` | Approve → "Can I upload it?" | DB | Content Editor, Pipeline |
| 26 | POST | `/api/instagram/posts/:id/publish` | Publish to Instagram feed / story | IG API, DB | Content Editor |
| 27 | POST | `/api/instagram/media` | Upload image/video file → public URL | disk | Content Editor |
| 28 | POST | `/api/instagram/story/publish` | Publish a story from a media URL | IG API | not used (publish with placement "story" instead) |
| 29 | GET | `/api/instagram/test` | Check Instagram connection | IG API | Onboarding, Settings |
| 30 | GET | `/api/instagram/account` | Your profile + stats + recent posts | IG API | Social Accounts |
| 31 | GET | `/api/instagram/followers` | Your followers / following / posts count | IG API | not used (Postman) |
| 32 | GET | `/api/instagram/instagram/followers` | Same as #31 (old URL) | IG API | not used |
| 33 | GET | `/api/instagram/competitor` | One brand's posts, engagement, hashtags | IG API | Hashtags page (competitor box) |
| 34 | GET | `/api/instagram/instagram/hashtag-search` | Hashtags used with one keyword (simple) | IG API, DB | Content Editor |
| 35 | POST | `/api/instagram/instargramAgent/research` | Old full AI Instagram research | IG API, LLM | InstagramStudio (legacy) |
| 36 | POST | `/api/market-research/:productId` | Old market research (5 AI agents) | LLM, IG API, DB | Onboarding |
| 37 | GET | `/api/market-research/:id` | One old research run | DB | not used now |
| 38 | GET | `/api/market-research/product/:productId` | Old research history | DB | not used now |
| 39 | GET | `/api/market-research/product/:productId/latest` | Latest old research | DB | Dashboard, Audience, Trends, Competitors (store) |
| 41 | GET | `/api/facebook/test` | Is the Facebook Page connected? (name, followers) | FB API | Social Accounts (connect modal) |
| 42 | GET | `/api/facebook/account?limit=25` | Your Page: followers, reactions / comments / shares, recent posts, hashtags | FB API | Social Accounts |
| 43 | GET | `/api/facebook/competitor?page=` | Another Page (username, id or link) — needs Meta "Page Public Content Access" | FB API | Postman |
| 44 | POST | `/api/facebook/brief/research` | Studio step 5: reads your Page's real posts for the brief (no LLM) | FB API | AI Content Studio |
| 45 | POST | `/api/facebook/posts/generate` | AI writes a text / photo / album / reel post | LLM, DB (+FB API) | Studio, Competitor Research |
| 46 | GET | `/api/facebook/posts` | List Facebook drafts + published posts | DB | Pipeline, Calendar, Dashboard (store) |
| 47 | GET | `/api/facebook/posts/:id` | One Facebook post | DB | Content Editor |
| 48 | PATCH | `/api/facebook/posts/:id` | Save manual edits (content, link, media) | DB | Content Editor |
| 49 | POST | `/api/facebook/posts/:id/revise` | AI rewrites the post from your prompt | LLM, DB | Content Editor |
| 50 | POST | `/api/facebook/posts/:id/approve` | Approve → "Can I post it to your Page?" | DB | Content Editor, Pipeline |
| 51 | POST | `/api/facebook/posts/:id/publish` | Publish to your Page feed / Page Story (`{ confirm: true, placement }`) | FB API, DB | Content Editor |
| 52 | POST | `/api/facebook/media` | Upload JPEG / PNG / MP4 / MOV → public URL | disk | Content Editor |
| 53 | GET | `/api/image-gen/options` | Compositions / product shapes / sizes for the image generator | — | Content Editor → Generate with AI |
| 54 | GET | `/api/image-gen/health` | Is the photo engine ready? (Stability AI key + credits, or local SD WebUI) | Stability / SD | Content Editor → Generate with AI |
| 55 | POST | `/api/image-gen/layout` | Prompt → AI layout JSON + SVG preview | LLM, DB | Content Editor → Generate with AI |
| 56 | GET | `/api/image-gen?productId=&postId=` | List generated images | DB | Content Editor (resume last image) |
| 57 | GET | `/api/image-gen/:id` | One image job (+ SVG preview) | DB | — |
| 58 | POST | `/api/image-gen/:id/revise` | AI changes the layout from feedback | LLM, DB | Content Editor → Generate with AI |
| 59 | PATCH | `/api/image-gen/:id/layout` | Manual edits (texts, layout, shape, size, photo prompt) | DB | Content Editor → Generate with AI |
| 60 | POST | `/api/image-gen/:id/approve` | Approve the layout sketch | DB | Content Editor → Generate with AI |
| 61 | POST | `/api/image-gen/:id/generate` | `{ mode: product \| scene \| sketch }` → photo → text + logo → JPEG | Stability / SD, disk, DB | Content Editor → Generate with AI |
| 62 | POST | `/api/image-gen/:id/compose` | Re-apply text / logo on the same photo (no GPU) | disk, DB | Content Editor → Generate with AI |
| 63 | POST | `/api/products/:id/logo` | Upload brand logo (raw PNG / JPEG / WebP / SVG body) | disk, DB | Generate with AI (logo box) |
| 64 | DELETE | `/api/products/:id/logo` | Remove brand logo | DB | — |
| 67 | GET | `/api/image-gen/storage` | Where media is kept: `{ cloud: true }` = Cloudinary | — | Content Editor |
| 65 | POST | `/api/products/:id/photo` | Upload real product photo (raw JPEG / PNG / WebP) — placed into AI scenes | disk, DB | Generate with AI (product photo box) |
| 66 | DELETE | `/api/products/:id/photo` | Remove product photo | DB | — |
| 40 | 404 | anything else | `Route not found` JSON | — | — |

---

## 1. System

```js
// GET /
// WHAT : health check — returns "Server is running".
// USES : nothing. The frontend pings it to show "API live" / "Backend offline".

// GET /api/prompts
// WHAT : returns a small demo list of prompt templates (hard-coded in server.js).
// USES : nothing. Not used by the frontend.

// GET /uploads/instagram/<file>
// WHAT : static files saved by POST /api/instagram/media.
//        Instagram downloads images/videos from here when publishing,
//        so in dev it must be public (set PUBLIC_BASE_URL, e.g. an ngrok URL).
```

## 2. Products — Brand Brain (`routes/productRoutes.js`)

```js
// POST /api/products
// WHAT : you describe your product in plain text -> the Product AI Agent (LLM) builds a
//        structured profile: name, category, description, features, benefits, uses,
//        target audience, price, positioning, keywords -> saved in MongoDB.
// BODY : "plain text"  or  { "description": "We sell A2 desi ghee..." }
// RET  : { data: { _id, rawInput, aiProfile: {...}, createdAt } }
// USES : LLM + DB

// GET /api/products/getProduct
// WHAT : all products, newest first (each product = one workspace / brand in the app).
// USES : DB

// GET /api/products/getIdProduct/:id
// WHAT : one product by Mongo _id.
// USES : DB
```

## 3. Hashtags — real hashtag data per platform (`routes/hashtagRoutes.js`)

Instagram is live. YouTube, TikTok, X, Threads, Pinterest, Facebook, LinkedIn exist as
"not connected yet" (`backend/services/hashtags/providers/<platform>.js`).

```js
// GET /api/hashtags/platforms
// WHAT : list of platforms -> { id, name, implemented, configured, features, quotaNote, notes }.
//        The Hashtags page shows "Soon" for platforms that aren't implemented.
// USES : nothing

// POST /api/hashtags/:platform/explore          e.g. /api/hashtags/instagram/explore
// WHAT : "Find real hashtags". For 1–4 keywords: Instagram Hashtag Search -> each hashtag's
//        TOP posts + posts from the LAST 24h -> every hashtag those real posts use.
//        Noise is removed (hashtagQuality.js): only hashtags used in 2+ DIFFERENT posts,
//        no spam tags (#fyp, #viral...), copies of the same post count once.
// BODY : { "seeds": "ghee, desi ghee" }   (or ["ghee", "desi ghee"])
// RET  : { platform, seeds:[...], hashtags:[{ hashtag, score, posts, topPosts, recentPosts24h,
//          avgLikes, avgComments, similar }], topPosts:[...], recentPosts:[...],
//          removed:{ oneOff, spam, samePost }, quota, limitations }
// ERR  : 404 unknown platform · 501 platform not connected yet · 503 API keys missing
// USES : IG API (graph.facebook.com ig_hashtag_search, /top_media, /recent_media) + DB (hashtag id cache)
// NOTE : each NEW hashtag uses 1 of Meta's 30 searches per 7 days. Searched hashtags are cached (free).

// GET /api/hashtags/:platform/quota
// WHAT : { used, limit: 30, remaining } — new hashtag searches in the last 7 days.
// USES : DB (HashtagCache collection)
```

## 4. Competitor Research (`routes/competitorResearchRoutes.js`)

The `/app/research` page: real competitor data → numbers → grounded AI report → approve → posts.

```js
// GET /api/competitor-research/platforms
// WHAT : platforms for the page (Instagram live, others "Soon" with notes) + maxCompetitors (20).
// USES : nothing

// GET /api/competitor-research/:platform/lookup?username=amul_india
//     (also accepts @amul_india or https://www.instagram.com/amul_india/ — cleaned by the server)
// WHAT : checks ONE exact username and returns a real profile card: name, photo, bio,
//        followers, posts, engagement rate, 3 recent posts. ("Yes, this is my competitor")
// ERR  : 404 not found / personal account · 400 invalid username · 501 platform not live
// USES : IG API (Business Discovery on graph.facebook.com)
// NOTE : Instagram has no search by brand name — exact username only, Business/Creator accounts only.

// POST /api/competitor-research   (OLD — the page now uses POST /pipeline, see 4b)
// WHAT : runs a full report and saves it (status "completed" | "partial" | "failed", approval "draft").
//        1) real data: each competitor's last ~30 posts (Business Discovery) + your own account
//        2) code computes: engagement rate, avg likes/comments, posts/week, format performance,
//           best days/hours, caption stats, hashtag gap, format gap, frequency gap, top posts
//        3) LLM writes summary, gaps, actions, hashtag plan, content ideas — ONLY from those
//           numbers; hashtags not seen in real posts are removed by code.
// BODY : { "productId": "...", "platform": "instagram", "competitors": ["amul_india","patanjali"],
//          "prompt": "We want more sales from young families" }
// RET  : { data: { _id, status, data:{ accounts, me, comparison, postResearch, notes, failed },
//                  analysis:{ summary, gaps, actions, hashtagPlan, contentIdeas, ... }, approval } }
// USES : IG API + LLM + DB
// NOTE : takes ~20–60 s. If the LLM fails you still get all real data (analysisError explains why).

// GET /api/competitor-research/product/:productId
// WHAT : saved reports for a product (light list: competitors, status, approval, posts created).
// USES : DB

// GET /api/competitor-research/:id
// WHAT : one full saved report.
// USES : DB

// POST /api/competitor-research/:id/approve
// WHAT : marks the report "approved". Only approved reports can create posts.
//        Pipeline reports: the "Customer Approval" agent becomes done.
// USES : DB

// POST /api/competitor-research/:id/posts
// WHAT : remembers which draft post was created from which content idea.
//        (The page creates the post with /api/content/brief + /api/instagram/posts/generate,
//         then calls this to link it.)
// BODY : { "ideaIndex": 0, "postId": "..." }
// USES : DB
```

### 4b. AI Competitor Intelligence & Content Strategy Agent (added 13 Oct 2026)

Multi-agent pipeline on `/app/research`. Researches 1–20 competing Instagram brands, analyses their posts and audience,
finds what works and what competitors miss, and builds an original content strategy for **your** brand
(the brand context — Brand Brain product, audience, keywords — decides what is analysed: coffee for Ycoo Coffee, skincare for GlowSkin).

**No LLM for every step.** All agents run on real Instagram Graph API data + code. The only LLM use is
**one optional call** (strategy writing + post ideas, grounded on the computed numbers) and **one optional call** in discovery
(candidate usernames, every one verified by the API). `useAI: false` = **0 LLM calls**.

**Two ways to pick competitors**
1. **Manual** — type a username / profile URL (#11) or paste a list → "Validate profiles" (one #11 call each) → confirm.
2. **AI-powered discovery** — #69 below.

```js
// GET /api/competitor-research/agents
// WHAT : every agent of the pipeline in run order, with its skill file.
// RET  : { data: [{ id, name, group, icon, engine: "code"|"api"|"code+llm"|"human"|"studio",
//                   deps: ["…"], skill: "post-analysis.md", role, llmRules, config: {…}, markdown }] }
// USES : nothing (reads backend/ai/competitorIntelligence/skills/*.md)

// POST /api/competitor-research/discover
// WHAT : Method 2 — finds competitors from the brand context and VERIFIES every one.
//        1) brand keywords -> up to 3 hashtag searches -> top posts -> @mentions in captions
//        2) @mentions in the captions of competitors you already picked ("known")
//        3) optional: 1 LLM call suggests usernames (candidates only)
//        4) every candidate -> Business Discovery API (personal / unknown accounts dropped)
//        5) relevance 0–100 in code: keyword fit, hashtag fit, recent activity, audience size, found by several sources
// BODY : { "productId": "...", "seeds": ["cold brew","filter coffee"], "known": ["bluetokaicoffee"], "useAI": true }
// RET  : { data: { candidates: [{ username, name, followers, mediaCount, engagementRate, biography,
//                  recentPosts, sources: ["#coffee","AI suggestion"], relevance, reasons: [...], verified: true }],
//                  rejected: [{ username, reason }], seeds, steps: [{ source, tag|of, found, note? }],
//                  stats: { candidatesFound, checked, verified, shown, llmCalls, durationMs }, notes, quota } }
// USES : IG API (hashtag search + Business Discovery) + DB (hashtag cache) + optional LLM
// NOTE : uses up to 3 of the 30 hashtag searches per 7 days. Max 24 accounts checked per call.

// POST /api/competitor-research/pipeline
// WHAT : creates the report (status "running") and starts the agents in the background. Returns at once.
// BODY : { "productId": "...", "platform": "instagram", "competitors": ["brand_a","https://instagram.com/brand_b"],
//          "prompt": "What we want from this research (optional)", "useAI": true, "method": "manual" | "discovery" }
// RET  : 202 { data: { _id, status: "running", pipeline: { agents: [...], counters, live, log }, ... } }
// ERR  : 400 no product / no competitors / more than 20 · 404 product not found · 400 non-Instagram platform
// USES : IG API + DB (+1 optional LLM call)

// GET /api/competitor-research/:id/progress
// WHAT : live status of every agent — poll every ~1 s while status === "running", then GET /:id for the full report.
// RET  : { data: { status, pipeline: {
//            startedAt, finishedAt, status, current: "post_analysis",
//            agents: [{ id, name, group, engine, deps, status: queued|running|done|waiting|failed|skipped,
//                       progress: 0-100, message, startedAt, finishedAt, durationMs, metrics: {…},
//                       children: [{ key: "brand_a", status, followers, engagementRate, posts, error? }] }],
//            counters: { competitors, competitorsDone, posts, comments, apiCalls, llmCalls, llmTokens },
//            live: { accounts: [{ username, followers, engagementRate, postsAnalyzed, bestFormat }] },
//            log: [{ at, agent, message }] } } }
// USES : server memory while running (instant), DB after
// NOTE : if the server restarts mid-run the report becomes "failed" after 2 min ("start the research again").

// POST /api/competitor-research/:id/results
// WHAT : Performance Analysis + Strategy Improvement. For posts created from this report and published:
//        real likes / comments + your insights (reach, saved, shares, views, total_interactions)
//        -> engagement rate vs the strategy KPI -> "double down" / "reduce" / "add a question" suggestions.
// RET  : full report with intelligence.results = { posts: [...], summary, improvements: [{ action, priority, evidence }] }
// USES : IG API (graph.instagram.com/{media-id}, /{media-id}/insights) + DB
```

**The agents** (`services/competitorIntelligence/`, run order — the frontend draws the graph from `GET /agents`)

| # | Agent | Engine | What it does | Output (in the report) |
|---|---|---|---|---|
| 1 | Orchestrator | code | Loads brand context, plans, runs agents, records live progress | `pipeline` |
| 2 | Competitor Research (×1 per brand, 3 in parallel) | IG API | Business Discovery: profile + last ~30 posts per competitor | `data.accounts` |
| 3 | Data Collection | IG API | Your account + comment **text** on your recent posts | `data.me` |
| 4 | Post Analysis | code | Themes, formats, hooks, caption length, hashtags, day × time heatmap, viral outliers (performance index = post ER ÷ account's typical post) | `intelligence.posts` |
| 5 | Comment Analysis | code | Your comments: sentiment, intents (purchase, question, complaint…), keywords, real questions. Competitors: comments per 100 likes, question lift | `intelligence.audience` |
| 6 | Competitor Performance | code | Score 0–100 (ER, momentum, frequency, consistency, conversation), tiers, what leaders do differently | `intelligence.performance` |
| 7 | Content Gap | code | Under-served themes / formats / hooks, conversation + CTA gaps, low-competition time slots, hashtag gap, audience questions, frequency gap — each with evidence | `intelligence.gaps` |
| 8 | Content Opportunity | code | Gaps → ranked opportunities (impact × white space × brand fit × ease × confidence) | `intelligence.opportunities` |
| 9 | Content Strategy | code + 1 LLM call (optional) | Cadence, format mix, pillars, posting slots, hashtag sets, KPIs, weekly calendar; LLM writes positioning + narrative | `intelligence.strategy`, `analysis` |
| 10 | Content Ideation | same LLM call / code templates | 4–6 original ideas, each linked to an opportunity + pillar | `intelligence.ideas`, `analysis.contentIdeas` |
| 11 | Content Brief | code | Production brief per idea: spec, structure, caption guidance, hashtags, slot, references, do / don't | `intelligence.briefs` |
| 12 | Quality Check | code | Real hashtags only, counts, hook length, evidence, no competitor names, unique, CTA → score 0–100 | `intelligence.quality` |
| 13 | Customer Approval | you | `POST /:id/approve` | `approval` |
| 14–15 | Image Agent / Video Agent | Studio | `POST /api/content/brief` + `POST /api/instagram/posts/generate` per chosen idea, then `POST /:id/posts` | `posts` |
| 16 | Publish / Schedule | IG API | Editor → `POST /api/instagram/posts/:id/publish` | post status |
| 17–18 | Performance Analysis / Strategy Improvement | IG API + code | `POST /:id/results` | `intelligence.results` |

**Skill files** — `backend/ai/competitorIntelligence/skills/*.md`, one per agent (instructions + a JSON config block under `## Config`, read
at run time by `skillLoader.js`: theme keyword lists, sentiment / intent lexicons, score weights, thresholds, brief specs,
hook templates, LLM rules). Edit a file and restart the server — no code change needed.

**Report fields added** (`models/CompetitorResearch.js`): `method` ("manual" | "discovery"), `useAI`, `pipeline`, `intelligence`.
`analysis` keeps the old shape (summary, gaps, actions, hashtagPlan, contentIdeas…) so the old report view still works;
`analysis.source: "code"` when it was built without the LLM.

**Token permissions:** comment text on your posts needs `instagram_business_manage_comments`; post insights need
`instagram_business_manage_insights`. Without them the run continues and the report says what was skipped.

Tests (fake Instagram data, no network / LLM / DB): `npm run test:intel`.

## 5. Content Studio (`routes/contentRoutes.js`)

```js
// GET /api/content/platforms
// WHAT : platforms + formats for the Studio ({ key, label, formats, live }).
// USES : nothing. (Frontend currently has its own copy of this list.)

// POST /api/content/brief
// WHAT : Studio step 1–3 "Prompt Optimizer": your free text -> ONE small JSON brief
//        (optimizedPrompt, importantWords, keyPoints, cta, formatHint, hashtagSeeds...).
//        Uses the saved product profile for trusted facts (name, price, features).
// BODY : { "userPrompt": "Launch post for our A2 ghee...", "productId": "..." }
// RET  : { data: brief, usage: { promptTokens, completionTokens } }
// USES : LLM + DB
```

## 6. Instagram — posts: create → edit → approve → publish (`routes/instagramRoutes.js`)

```js
// POST /api/instagram/brief/research
// WHAT : Studio step 3. Takes the brief's important words and gets LIVE hashtags real
//        creators use with them (no LLM, 0 tokens).
// BODY : { "productId": "...", "brief": {...} }
// USES : IG API (hashtag search)

// POST /api/instagram/brief/research/jobs          (Studio step 5 uses this one)
// WHAT : same research as above, as a BullMQ job. Answers at once: { data: { jobId, mode, reused } }
//        mode "queue"  = Redis + worker (npm run worker) do it
//        mode "memory" = Redis down / no worker -> the API runs it itself (same answers, no queue)
//        Same brief again within 10 min -> same job, result at once (reused: true)

// GET /api/instagram/brief/research/jobs/:jobId
// WHAT : { state: waiting|active|completed|failed, progress: { stage, seeds: [{ hashtag, status, posts, fromCache }],
//          partialHashtags, mediaAnalyzed, elapsedMs }, result (when completed), failedReason, hint }

// POST /api/instagram/posts/:id/live-hashtags
// WHAT : draft -> refine. BODY { jobId } (finished research job) or { research }.
//        Keeps the draft's hashtags that are real, adds live ones matching the brief, max 5. Skipped if the user edited the post.

// POST /api/instagram/posts/generate
// WHAT : AI writes the draft: caption, hashtags, slides / reel script / image idea.
//        Studio flow   : { productId, brief, research?, contentType?, userPrompt? }
//                        (if "research" is sent with hashtags, no live search is done)
//        Studio draft  : { productId, brief, deferResearch: true } -> written from the brief only
//                        (research still running); then POST /posts/:id/live-hashtags
//        Legacy flow   : { productId, instagramResearch, contentType, userPrompt }
//        contentType   : "image" | "reel" | "carousel"
// RET  : { data: post (status "draft"), usage, assistant: { message, actions } }
// USES : LLM + DB (+ IG API when it has to research hashtags itself)

// GET /api/instagram/posts?productId=...&status=draft
// WHAT : list posts (max 50, newest first). status: draft | approved | publishing | published | failed
// USES : DB

// GET /api/instagram/posts/:id
// WHAT : one post (with finalCaption + captionLength).
// USES : DB

// PATCH /api/instagram/posts/:id
// WHAT : save your manual edits.
// BODY : { "content": {...}, "media": [{ type, url }], "coverUrl": "..." }
// USES : DB

// POST /api/instagram/posts/:id/revise
// WHAT : AI changes the post the way you ask ("make it shorter", "add a discount line").
// BODY : { "userPrompt": "...", "contentType": "reel" (optional) }
// USES : LLM + DB

// POST /api/instagram/posts/:id/approve
// WHAT : validates the post, sets status "approved", then the assistant asks
//        "Can I upload it?" — or tells you what's missing (media / public URL).
// BODY : { "placement": "feed" | "story" } (optional)
// USES : DB

// POST /api/instagram/posts/:id/publish
// WHAT : publishes for real. Needs your confirmation.
//        feed : image / reel / carousel with caption   story : first image/video, no caption
// BODY : { "confirm": true, "placement": "feed" | "story" }
// RET  : { data: post (status "published", instagram.permalink), assistant: { message, permalink } }
// USES : IG API (POST /{ig-user-id}/media -> /media_publish on graph.instagram.com) + DB

// POST /api/instagram/media
// WHAT : upload a file (raw body). Saved in backend/uploads/instagram and returns a URL.
// BODY : the file itself. Content-Type: image/jpeg | video/mp4 | video/quicktime (no PNG/WebP)
// RET  : { data: { type, url, mimeType, publicReachable } }
// USES : disk only. publicReachable=false means Instagram can't download it (localhost).

// POST /api/instagram/story/publish
// WHAT : publish a Story directly from a media URL (older endpoint).
// BODY : { "mediaUrl": "https://...", "mediaType": "IMAGE" | "VIDEO" }
// USES : IG API. Frontend uses /posts/:id/publish with placement "story" instead.
```

## 7. Instagram — account, competitors, hashtags (`routes/instagramRoutes.js`)

```js
// GET /api/instagram/test
// WHAT : checks the Instagram token works -> your user_id + username.
// USES : IG API (graph.instagram.com/me)

// GET /api/instagram/account?limit=25
// WHAT : YOUR account: profile (followers, following, posts, bio), stats (avg likes/comments,
//        engagement rate, posts/week, best post, top hashtags) and recent posts.
// USES : IG API (graph.instagram.com/me + /me/media, token INSTAGRAM_ACCESS_TOKEN)

// GET /api/instagram/followers          (old URL: /api/instagram/instagram/followers)
// WHAT : your username, name, picture, followers, following, posts count.
// USES : IG API. Not used by the frontend (Postman / testing).

// GET /api/instagram/competitor?username=amul_india
// WHAT : any Business/Creator account: profile + last 30 posts + engagement rate +
//        posts/week + best post + hashtags they use.
// USES : IG API (Business Discovery on graph.facebook.com, token META_ACCESS_TOKEN)

// GET /api/instagram/instagram/hashtag-search?q=snitch
// WHAT : simple version: ONE keyword -> up to 30 hashtag names used with it (no metrics).
//        Older than /api/hashtags/:platform/explore and without the noise filter.
// USES : IG API (hashtag search, uses the 30/week quota) + DB cache

// POST /api/instagram/instargramAgent/research
// WHAT : OLD full research: real hashtags for the product, then the LLM picks from them and
//        writes audience + content ideas. Only the legacy InstagramStudio page uses it.
// BODY : product profile JSON (+ optional "seedHashtags": ["ghee"])
// USES : IG API + LLM
```

## 8. Market Research — old (`routes/marketResearchRoutes.js`)

Replaced on `/app/research` by Competitor Research. Kept because Dashboard, Audience, Trends,
Competitors and Onboarding still read its data. Mostly LLM opinion: only Instagram adds real hashtags.

```js
// POST /api/market-research/:productId
// WHAT : starts 5 AI agents (Instagram, YouTube, Facebook, WhatsApp, Pinterest) + an aggregator
//        (plain code) -> platform ranking, audience, pain points, content gaps. Runs in background.
// BODY : { "platforms": ["instagram","youtube"] } (optional)
// USES : LLM + IG API (Instagram hashtags only) + DB

// GET /api/market-research/:id                         one run (poll while "running")
// GET /api/market-research/product/:productId          history of runs
// GET /api/market-research/product/:productId/latest   newest run (used by Dashboard etc.)
// USES : DB
```

---

## External APIs the backend calls

| Service | Endpoint(s) | Used for | Token / key in `.env` |
|---|---|---|---|
| Instagram Graph API | `graph.instagram.com/me`, `/me/media` | Your account, your posts | `INSTAGRAM_ACCESS_TOKEN` (IGAA…) |
| Instagram Graph API | `graph.instagram.com/{ig-user-id}/media`, `/media_publish` | Publishing feed posts, reels, carousels, stories | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_API_VERSION` |
| Meta Graph API | `graph.facebook.com/ig_hashtag_search`, `/{hashtag-id}/top_media`, `/recent_media` | Real hashtags (30 new hashtags / 7 days) | `META_ACCESS_TOKEN` (EAA…), `META_INSTAGRAM_USER_ID`, `META_GRAPH_API_VERSION` |
| Meta Graph API | `graph.facebook.com/{ig-user-id}?fields=business_discovery.username(x){...}` | Competitor profiles + posts, discovery verification | same as above |
| Instagram Graph API | `graph.instagram.com/{media-id}/comments` | Comment text on your posts (Comment Analysis Agent) | `INSTAGRAM_ACCESS_TOKEN` (+ `instagram_business_manage_comments`) |
| Instagram Graph API | `graph.instagram.com/{media-id}`, `/{media-id}/insights` | Results of your published posts (Performance Analysis Agent) | `INSTAGRAM_ACCESS_TOKEN` (+ `instagram_business_manage_insights`) |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | All LLM features (default) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `LLM_PROVIDER=openrouter` |
| Google Gemini | `@google/genai` SDK | LLM alternative | `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_PROVIDER=gemini` |
| MongoDB | `MONGO_URI` | Products, posts, research, hashtag cache | `MONGO_URI` |

Optional `.env` settings: `PUBLIC_BASE_URL` (public URL for uploads), `HASHTAG_MIN_POSTS`,
`HASHTAG_BLOCKLIST`, `INSTAGRAM_HASHTAG_SEEDS`, `COMPETITOR_MEDIA_LIMIT`, `REPORT_TIMEZONE`,
`RESEARCH_CONCURRENCY`, `RESEARCH_TIMEOUT_MS`, `MAX_UPLOAD_SIZE`.

## Not available from official APIs (so the app doesn't show them)

- Shares, saves, reach, views and story data for **other** accounts
- Personal / private Instagram accounts
- Searching Instagram accounts by brand name (exact username only)
- Who posted a hashtag post (Meta hides the username)
- The **text** of comments on other brands' posts (only comment counts) — competitor audiences are measured by comments per 100 likes


---

## Facebook (added 8 Oct 2026)

Same flow as Instagram: Studio → research → AI post → edit / revise → approve → publish. Code: `routes/facebookRoutes.js`,
`controllers/facebook*.js`, `services/facebook*.js`, `ai/marketResearch/platforms/facebook/*`, `models/FacebookPost.js`.

**.env** (nothing new is required — it reuses the Meta values)

| Variable | Used for | Fallback |
|---|---|---|
| `FACEBOOK_PAGE_ID` | the Page we read / post to | `META_PAGE_ID` |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Page token (optional) | exchanged from `META_ACCESS_TOKEN` (user token of a Page admin) |
| `FACEBOOK_API_VERSION` | Graph API version | `META_GRAPH_API_VERSION` |

Token permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.

**Formats** (`contentType`): `text` (with optional `content.link`), `image` (1 photo), `carousel` (photo album, 2–10 images, no video), `reel` (1 video).
`placement: "story"` posts the first image / video as a Page Story. Media must be on a public URL (set `PUBLIC_BASE_URL`, e.g. ngrok).

**What Meta allows**

| | Works now | Needs Meta approval | Not possible |
|---|---|---|---|
| Publish posts / reels / stories to your Page | ✅ | | |
| Your Page stats, posts, hashtags | ✅ | | |
| Other Pages (competitors, e.g. `amul.coop`) | | "Page Public Content Access" | |
| Search any hashtag across Facebook | | | ❌ no API |

Also live: `POST /api/hashtags/facebook/explore` (hashtags from your own Page's posts) and Facebook in
`/api/competitor-research` (`platform: "facebook"`). Tests: `npm run test:facebook`.

## Image generation (added 9 Oct 2026)

In the Content Editor the media area now has two options: **your own image** (upload / URL, as before) or **Generate with AI**.

```
User prompt -> SVG layout preview -> user approval -> SVG -> PNG -> photo engine
            -> photorealistic photo -> real typography + logo on top -> JPEG added to the post
```

**FREE: Cloudflare Workers AI (default, added 9 Oct 2026)** — `IMAGE_PROVIDER=cloudflare` (default when `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` are set).
Code: `services/imageGen/cloudflareImageClient.js`. Model `@cf/black-forest-labs/flux-2-klein-4b` (FLUX.2 [klein]): your product photo goes in as
`input_image_0` (reference images must be < 512 px), the user's prompt word for word, output 1024×1280 (4:5) / 1280×1280 / 1024×1824.
Free plan: 10,000 neurons/day ≈ 60 images/day, no credit card, resets 00:00 UTC (5:30 AM IST).
Setup: free account at dash.cloudflare.com → copy **Account ID** → My Profile → API Tokens → Create Token → template **Workers AI** →
put both in `.env` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`), restart. Optional `CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell` (~250/day, text only).

**Google Gemini (paid, best quality)** — `IMAGE_PROVIDER=gemini` (default when `GEMINI_IMAGE_API_KEY` or `GEMINI_API_KEY` is set).
Code: `services/imageGen/geminiImageClient.js` (REST `models/{model}:generateContent`, `responseModalities: ["TEXT","IMAGE"]`, `imageConfig: { aspectRatio, imageSize }`).
- Gets the user's prompt **word for word** (no summary) + rules: keep the headline area empty, add no text of its own.
- `product` mode sends your **real product photo as a reference image** → the same jar / label inside the new scene.
- `sketch` mode sends the layout sketch as a reference image.
- Model: best available of `gemini-nano-banana-2.1` (~$0.05 / 2K image), `gemini-3.1-flash-image`, `gemini-3-pro-image` (~$0.13), `gemini-2.5-flash-image`, or `GEMINI_IMAGE_MODEL`.
- Image output has **no free tier**: turn on billing for the key in Google AI Studio. Every image carries Google's invisible SynthID watermark.
- The exact prompt sent is saved in `generation.prompt` and shown in the generator ("Exact prompt sent to the image AI").

| Variable | Default | |
|---|---|---|
| `IMAGE_PROVIDER` | `cloudflare` if its keys are set, else `gemini` if a Gemini key is set, else `stability` | `cloudflare` \| `gemini` \| `stability` \| `webui` |
| `GEMINI_IMAGE_API_KEY` | falls back to `GEMINI_API_KEY` | key from aistudio.google.com/apikey |
| `GEMINI_IMAGE_MODEL` | auto | force a model |
| `GEMINI_IMAGE_SIZE` | `2K` | `1K` \| `2K` \| `4K` (4K = Pro only) |

**Photo modes** (`mode` in `POST /:id/generate`, picked in the generator):

| Mode | What happens | When | Stability credits |
|---|---|---|---|
| `product` (default when a product photo is uploaded) | YOUR real product photo is placed where the layout wants it → `replace-background-and-relight` paints the scene around it and relights it. The label / logo stay exactly as photographed. | ads with your real pack | ~8 |
| `scene` (default without a photo) | Stable Image Ultra paints the whole photo from the detailed description (people, food, kitchen). The product and its label are AI-drawn. | lifestyle scenes, no photo yet | ~8 |
| `sketch` | Control: Sketch follows the layout sketch strictly. | simple product-on-a-surface shots | ~5 |

The photo prompt keeps every detail of the user's description (up to ~180 words) but never asks the AI to write brand names or text
(it misspells them) — the real headline, CTA and logo are drawn on top afterwards.

**Photo engine** (`services/imageGen/imageProviders.js`, picked by `IMAGE_PROVIDER` in `.env`):

| `IMAGE_PROVIDER` | What runs | Needs | Cost |
|---|---|---|---|
| `stability` (default) | Stability AI **Control: Sketch** API — our black-on-white sketch at 1080 px → photo of the same size | internet + API key | ~3–5 credits (~$0.03–0.05) per image; Google sign-up gives 25 free credits |
| `webui` | local AUTOMATIC1111 / Forge + ControlNet Scribble + realistic SD 1.5 checkpoint | NVIDIA GPU (6 GB+) | free |

| Step | Code |
|---|---|
| Prompt → layout JSON (composition, product shape, props, headline / subline / CTA, photo prompt) | `ai/imageGen/AdLayoutAgent.js`, `AdLayoutPrompt.js`, `AdLayoutSpecs.js` |
| Layout → preview SVG (what the user approves) and sketch SVG (text area left empty) | `services/imageGen/layoutRenderer.js` |
| Sketch → photo | `services/imageGen/stabilityClient.js` (Stability AI) or `sdWebuiClient.js` (local WebUI) |
| Photo → final ad (scrim + text + logo, auto light/dark text, logo plate if needed) → JPEG | `services/imageGen/adComposer.js` (sharp) |
| Whole run / re-apply text | `services/imageGen/adImagePipeline.js` |
| Routes / DB | `routes/imageGenRoutes.js`, `controllers/imageGenController.js`, `models/AdImage.js`, `Product.logoUrl` |
| UI | `frontend/src/app/ui/ImageGenerator.jsx`, `frontend/src/api/imageGenApi.js` |

Files are saved in `backend/uploads/generated/` (sketch PNG, raw photo PNG, final JPEG) and `backend/uploads/logos/`.
The final image is always **JPEG** (Instagram's API accepts only JPEG). To publish, `PUBLIC_BASE_URL` must be set (ngrok), same as uploads.

**Setup with Stability AI (any laptop, no GPU)**

1. `cd backend && npm install` (adds `sharp`).
2. Sign up at https://platform.stability.ai (Google sign-in gives 25 free credits) → Account → API Keys → create a key.
3. In `backend/.env`: `STABILITY_API_KEY=sk-...` → restart the backend.
4. The generator shows "Stability AI ready · N credits left".

**Setup with a local GPU instead** (`IMAGE_PROVIDER=webui`): install AUTOMATIC1111 or Forge, start it with `--api`, put a realistic SD 1.5 checkpoint
(e.g. Realistic Vision V6) in `models/Stable-diffusion/` and `control_v11p_sd15_scribble.pth` in `models/ControlNet/`.

**.env** (only `STABILITY_API_KEY` is needed for the hosted option)

| Variable | Default | |
|---|---|---|
| `IMAGE_PROVIDER` | `stability` | which photo engine (`webui` = local GPU) |
| `STABILITY_API_KEY` | — | Stability AI key |
| `STABILITY_CONTROL_STRENGTH` | `0.7` | sketch mode: 0–1, how strictly the photo follows the sketch |
| `STABILITY_PRESERVE_SUBJECT` | `0.8` | product mode: 0–1, how exactly your product photo is kept |
| `STABILITY_SCENE_MODEL` | `ultra` | scene mode: `ultra` (best) or `core` (cheaper, ~3 credits) |
| `SD_WEBUI_URL` | `http://127.0.0.1:7860` | local WebUI address |
| `SD_CHECKPOINT` / `SD_CONTROLNET_MODEL` | loaded one / `control_v11p_sd15_scribble` | part of the name is enough |
| `SD_STEPS` / `SD_CFG` / `SD_SAMPLER` / `SD_CONTROL_WEIGHT` / `SD_HIRES` | `30` / `6` / `DPM++ 2M Karras` / `0.85` / `0` | local WebUI only |
| `AD_FONT_FAMILY` | Inter / Segoe UI / Arial | font for the headline / CTA |

Tests (fake LLM + fake Stability AI / Stable Diffusion, no network): `npm run test:imagegen`.

## Media storage — Cloudinary (added 9 Oct 2026)

Instagram / Facebook **download** media from a public link. Files saved on this server (`http://localhost:5000/uploads/...`) can't be reached,
and on Render's free plan local files are deleted on every restart / deploy / sleep. So with `CLOUDINARY_URL` set:

- `POST /api/instagram/media`, `POST /api/facebook/media`, generated ads, logos and product photos are uploaded to **Cloudinary** → permanent `https://res.cloudinary.com/...` links.
- On **approve / publish**, media that still points at this server (old drafts) is uploaded to Cloudinary and the URLs are swapped automatically (`services/publicMedia.js`).
- No ngrok / `PUBLIC_BASE_URL` needed, locally or on Render. Without `CLOUDINARY_URL` everything works as before (local disk).

Setup: free account at cloudinary.com (no card) → Dashboard → copy **API environment variable** → `backend/.env`: `CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>` → restart.
On Render, add the same variable under Environment. Free plan limits: images ≤ 10 MB, videos ≤ 100 MB per file.
Code: `services/cloudStorage.js` (signed REST upload, no SDK), `services/publicMedia.js`. Tests: `npm run test:media`.

## Fast Instagram research — queue, cache, pre-warm (added 13 Oct 2026)

Studio step 5 used to take ~7 minutes (seeds one by one, 3+3 pages each, up to 5 × 60 s retries per edge, cache lost on restart).
Now research and the post draft run **at the same time**, and the research itself is faster:

| What | Where |
|---|---|
| Seed ids one by one (quota-safe), then **all 4 seeds in parallel** | `services/instagramHashtagResearchService.js` |
| Research asks Meta **without `media_url`** (faster, rarely "reduce data") — the Hashtags page still gets thumbnails | `services/instagramService.js` |
| **150 posts per seed** target (100 top + 50 recent), keeps paging if a niche hashtag gives less | `INSTAGRAM_MIN_POSTS_PER_SEED` |
| Pages of **25** (Meta mostly refuses / times out at 50); "reduce data" **or timeout** → smaller page, never the same request again; a failing page 2 → same cursor, smaller page | `INSTAGRAM_RESEARCH_PAGE_SIZE` |
| **Time budget 75 s**: after it no new pages start (page 1 always runs, fetched data is kept). Meta needs 12–24 s per call, so this is the time ↔ posts knob | `INSTAGRAM_RESEARCH_BUDGET_MS` |
| Brand / product name (e.g. a new brand) is **not searched** (≈0 posts, wastes weekly quota) | `InstagramBriefResearch.js` |
| One door for Meta calls: max 8 at once, backoff 2s/4s/8s on rate limits (timeouts are NOT retried), timing log per call `[Meta] 812ms ...` | `services/metaClient.js` |
| Timeout 60 s → 25 s, remembers which field set Meta accepted | `INSTAGRAM_HASHTAG_TIMEOUT_MS` |
| Posts cache in **MongoDB** (survives restarts): top 24 h, recent 6 h | `models/HashtagMediaCache.js` |
| **BullMQ queue + worker** with per-hashtag progress | `queues/`, `workers/worker.js` |
| **Pre-warm** every 6 h: hashtags used in the last 7 days (no quota) + category list (only while > 20 weekly searches are left) | `services/hashtagPrewarmService.js` |
| Draft → refine: caption/hook from the brief while research runs, then live hashtags | `InstagramLiveHashtags.js`, `ContentStudio.jsx` |

**Run locally (3 terminals):**

```bash
docker run -d --name sociva-redis -p 6379:6379 redis   # once (later: docker start sociva-redis)
cd backend && npm install                              # once: installs bullmq + ioredis
npm run dev                                            # API
npm run worker                                         # worker (or npm run dev:worker)
```

Without Redis / worker everything still works ("memory" jobs, same UI) — the log says `[ResearchJobs] running in memory`.

**.env (all optional, defaults shown):**

```
REDIS_URL=redis://127.0.0.1:6379
QUEUES_ENABLED=true
RESEARCH_WORKER_CONCURRENCY=2
INSTAGRAM_SEED_CONCURRENCY=4
INSTAGRAM_MIN_POSTS_PER_SEED=150
INSTAGRAM_RESEARCH_PAGE_SIZE=25        # 50 | 25 | 10
INSTAGRAM_RESEARCH_MAX_PAGES=6
INSTAGRAM_RESEARCH_BUDGET_MS=75000     # 60000 = faster, fewer posts; 90000 = slower, more posts
INSTAGRAM_HASHTAG_TIMEOUT_MS=25000
INSTAGRAM_TOP_CACHE_HOURS=24
INSTAGRAM_RECENT_CACHE_HOURS=6
META_MAX_CONCURRENT=8
META_TIMING_LOGS=true
PREWARM_ENABLED=true
PREWARM_EVERY_HOURS=6
PREWARM_USED_LIMIT=15
PREWARM_CATEGORY_HASHTAGS=coffee,skincare,fashion,fitness,food,haircare,organicfood,homedecor   # "none" = off
PREWARM_QUOTA_RESERVE=20
```

`npm run prewarm` = run the pre-warm once now. Tests: `npm run test:speed` (fake Meta), `npm run test:queue` (needs Redis).
Hosting: the worker must run as a **long-running process** (Render/Railway background worker or VPS) — not on serverless functions.

