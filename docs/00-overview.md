# Fineli AI — Project Overview

## What Is This?

A conversational food diary web app that lets users describe what they ate in natural language, resolves foods to the Finnish Fineli food composition database, calculates nutrients, and exports standardized `.xlsx` reports matching Fineli's diary export format.

## Target Users

1. **Fineli diary users** who find the current form-based UI slow on mobile
2. **Dietitians / coaches** who need standardized exports for clients
3. **Research pilots** (small studies) needing consistent food diaries

## Value Proposition

- "Just tell me what you ate" — the app does the structured data work
- Higher completion rates than form-based diaries
- Outputs a standardized `.xlsx` report usable downstream

## Core Differentiators

- Conversational UX with "missing data detection" (e.g., oatmeal usually has milk)
- Fast Fineli food matching with disambiguation UI
- Export compatibility (same sheet/columns/totals style as Fineli)

---

## MVP Scope

### Must-Have

| Feature | Description |
|---------|-------------|
| Day/meal selection | Date picker + meal type (Aamiainen, Lounas, Päivällinen, Välipala, custom) |
| Chat capture | Natural language input with guided follow-up questions |
| Food search | Search Fineli database, show top matches, disambiguate |
| Portion handling | Convert portions/units to grams using Fineli unit data |
| Nutrient calculation | Compute per-item nutrients from Fineli per-100g values |
| Excel export | Fineli-style `.xlsx` with item rows, meal subtotals, day totals |
| Basic auth | Anonymous mode (local session) + optional email magic link |

### Nice-to-Have (Post-MVP)

- Favorites / recent foods
- Barcode scan (product DB integration)
- "Templates" (e.g., "my usual breakfast")
- Sharing link for dietitian
- Offline support

### Nice-to-Have (AI-Enhanced, Post-MVP Phase 2)

- AI-powered natural language parsing (Claude / OpenAI)
- AI-generated conversational responses in Finnish
- Smart portion estimation from informal language
- Proactive food companion suggestions via AI
- Nutritional insights after meal completion
- Streaming chat responses

### Out of Scope for MVP

- Mobile native app
- Multi-language UI (Finnish only, English fallback)
- Real-time collaboration

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React 18, TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Routes (same project) |
| Database | PostgreSQL (`pg` + drizzle-orm/node-postgres) |
| Auth | Anonymous sessions + email magic link (custom or Supabase Auth) |
| Food data | Fineli Open Data REST API (`fineli.fi/fineli/api/v1/`) |
| Export | `exceljs` library for `.xlsx` generation |
| State management | React Query (TanStack Query) for server state, React state for UI |

---

## Assumptions

- **Meals**: Aamiainen, Lounas, Päivällinen, Välipala + custom label
- **Export**: Single "Fineli v1" template matching Fineli's diary export
- **Auth**: Start with anonymous + optional login later
- **Language**: UI in Finnish, food search in Finnish; English names available as fallback
- **Timezone**: Default `Europe/Helsinki`; diary dates are local dates (no timezone)

---

## Document Index

| Document | Contents |
|----------|----------|
| [01-architecture.md](./01-architecture.md) | System architecture, folder structure, deployment |
| [02-data-model.md](./02-data-model.md) | Database schema, TypeScript types, migrations |
| [03-api-routes.md](./03-api-routes.md) | All REST API endpoints with request/response types |
| [04-fineli-integration.md](./04-fineli-integration.md) | Fineli API details, caching, food search ranking |
| [05-conversation-engine.md](./05-conversation-engine.md) | State machine, message parsing, question templates |
| [06-ui-components.md](./06-ui-components.md) | Component specs, layout, responsive design, accessibility |
| [07-export.md](./07-export.md) | Excel export specification, template JSON, formatting |
| [08-corner-cases.md](./08-corner-cases.md) | Comprehensive corner cases across all subsystems |
| [09-development-setup.md](./09-development-setup.md) | Dev environment, testing strategy, deployment |
| [10-work-split.md](./10-work-split.md) | Codex + Claude task assignments, dependency graph, parallel plan |
| [11-ai-integration.md](./11-ai-integration.md) | AI provider integration (Claude/OpenAI), enhanced parsing, streaming |
