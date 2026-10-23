# Sociva app (frontend)

New dashboard UI built from the Figma. Everything lives in `src/app/`; the landing page and auth page are unchanged (except that sign-in now goes to `/app` and sign-up to `/onboarding`).

## Run

```bash
cd backend && npm run dev      # http://localhost:5000
cd frontend && npm run dev     # http://localhost:5173 -> /onboarding or /app
```

Point the UI at another API with `VITE_API_URL` in `frontend/.env`.

## Routes

| Route | Page | Backend |
|---|---|---|
| `/onboarding` | 5-step wizard: Business → Brand Brain → Goals → Channels → Autopilot | **Live**: `POST /api/products`, `GET /api/instagram/test`, `POST /api/market-research/:productId` |
| `/app` | Dashboard | Live posts + demo KPIs |
| `/app/accounts` | Social accounts | **Live** Instagram check, other channels demo |
| `/app/studio` | AI Content Studio | **Live**: Instagram research agent + `POST /api/instagram/posts/generate`, approve |
| `/app/editor/:id` | Content editor (edit → AI revise → approve → "Can I upload?" → publish, media upload) | **Live**: all `/api/instagram/posts/*` + `/api/instagram/media` |
| `/app/pipeline` | Publishing pipeline (kanban by post status) | **Live** (demo board when empty) |
| `/app/calendar` | Content calendar | **Live** posts + optional sample schedule |
| `/app/research` | Market research (5 agents + aggregator, polling, history) | **Live** |
| `/app/trends`, `/competitors`, `/hashtags`, `/audience` | Intelligence | Demo + live signals from the latest market research / Instagram research |
| `/app/analyst`, `/inbox`, `/dm`, `/leads`, `/analytics`, `/repurpose` | | Demo (backend not built yet) |
| `/app/settings` | Profile, Brand Brain, guardrails, team, integrations, billing | Live Brand Brain + API/Instagram health |

Demo sections are marked with a yellow **Demo data** tag; live ones with a green **Live** tag. When the backend is offline the whole app still renders with demo data.

## Structure

```
app/
  api.js          every backend call (re-uses src/api/*)
  store.jsx       WorkspaceProvider: backend status, products (brands), current product, latest research, posts
  brand.js        brand voice / goals (stored in localStorage until the backend has a field for it)
  postUtils.js    status labels, client-side post score
  mock.js         demo data — replace export by export as APIs land
  ui/             Icon set, SVG charts, UI kit (Btn, Card, Pill, Modal, Toast, …)
  layout/         sidebar + top bar
  pages/          one file per screen
  app.css         design system (all classes prefixed `sa-`)
```

## Hooking up a new API

1. Add the call to `api.js`.
2. In the page, replace the `mock.js` import with the call (pattern: `useAsync(fn, deps, { fallback: MOCK })` from `ui/kit.jsx` keeps the demo data as an offline fallback).
3. Swap `<DemoTag />` for `<LiveTag />`.
