# 01 — System Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ DatePicker   │  │ MealSelector │  │    ExportButton       │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
│  ┌──────────────────────┐  ┌───────────────────────────────┐ │
│  │     ChatPanel         │  │      MealItemsPanel           │ │
│  │  - Messages           │  │  - MealItemsList              │ │
│  │  - QuickReply         │  │  - NutrientSummary            │ │
│  │  - Input              │  │  - Edit/Delete                │ │
│  └──────────────────────┘  └───────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                    REST API (JSON)
                              │
┌──────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Auth      │  │ Diary CRUD   │  │ Chat / Conversation    │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Export    │  │ Fineli Proxy │  │ Nutrient Calculator    │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │                │                    │
  SQLite (MVP)     Fineli API           In-memory cache
  PostgreSQL       (fineli.fi)
  (future)
```

## Request Flow: User Sends a Chat Message

```
1. User types "I had oatmeal with milk and a banana"
2. POST /api/chat/message { mealId, message }
3. Server:
   a. parseMealText(message) → ["oatmeal", "milk", "banana"]
   b. For each item: FineliClient.search(item) → candidates[]
   c. conversationEngine.resolveItems(candidates) → questions or resolved items
   d. Store conversation state
   e. Return { assistantMessage, state, resolvedItems? }
4. Client renders assistant message with disambiguation/portion buttons
5. User taps a button → POST /api/chat/message { mealId, message: "1" }
6. Repeat until all items resolved
7. Resolved items saved to meal_items table
```

## Key Design Decisions

### Deterministic Conversation Engine (No LLM Required)

The "asking questions" logic is a deterministic state machine, not an LLM. This ensures:
- Predictable behavior
- No API costs for conversation
- No hallucinated food names
- Fast responses

Optional LLM usage is limited to one place: `parseMealText()` for splitting natural language into food items. The MVP uses regex/rule-based parsing; LLM is a future enhancement.

### Nutrient Snapshots

When a food item is resolved, we store `nutrients_json` (per 100g values at that point in time). This means:
- Exports are stable even if Fineli updates nutrient data later
- Works even if a Fineli food ID is removed
- No runtime dependency on Fineli for viewing/exporting past data

### Fineli API as Proxy

The client never calls Fineli directly. All Fineli requests go through our API routes, which:
- Add caching (avoid hammering Fineli's API)
- Normalize response format
- Handle rate limiting
- Provide fallback from cache if Fineli is down

---

## Folder Structure

```
fineli-ai/
├── docs/                          # Design documents (this folder)
├── public/                        # Static assets
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Main diary page (single-page app)
│   │   ├── globals.css            # Tailwind imports
│   │   └── api/                   # API routes
│   │       ├── auth/
│   │       │   ├── anonymous/route.ts
│   │       │   ├── magic-link/route.ts
│   │       │   └── verify/route.ts
│   │       ├── diary/
│   │       │   ├── days/route.ts
│   │       │   ├── days/[date]/route.ts
│   │       │   ├── days/[date]/meals/route.ts
│   │       │   ├── meals/[id]/route.ts
│   │       │   └── items/[id]/route.ts
│   │       ├── chat/
│   │       │   ├── message/route.ts
│   │       │   └── state/[mealId]/route.ts
│   │       ├── fineli/
│   │       │   ├── search/route.ts
│   │       │   └── food/[id]/route.ts
│   │       └── export/
│   │           └── xlsx/route.ts
│   ├── components/                # React components
│   │   ├── diary/
│   │   │   ├── DatePicker.tsx
│   │   │   ├── MealSelector.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MealItemsList.tsx
│   │   │   ├── MealItemCard.tsx
│   │   │   ├── NutrientSummary.tsx
│   │   │   ├── ExportButton.tsx
│   │   │   └── QuickReplyButtons.tsx
│   │   └── ui/                    # Generic UI primitives
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Dialog.tsx
│   │       └── Spinner.tsx
│   ├── lib/                       # Shared logic
│   │   ├── db/
│   │   │   ├── client.ts          # PostgreSQL client (pg / drizzle)
│   │   │   ├── schema.ts          # Table definitions
│   │   │   └── migrations/        # SQL migration files
│   │   ├── fineli/
│   │   │   ├── client.ts          # Fineli API client with caching
│   │   │   ├── types.ts           # Fineli response types
│   │   │   ├── search.ts          # Food search + ranking
│   │   │   ├── nutrients.ts       # Nutrient computation
│   │   │   └── portions.ts        # Unit → grams conversion
│   │   ├── conversation/
│   │   │   ├── engine.ts          # State machine orchestrator
│   │   │   ├── parser.ts          # Message text → parsed items
│   │   │   ├── resolver.ts        # Item resolution logic
│   │   │   ├── questions.ts       # Question template generator
│   │   │   └── types.ts           # ConversationState, ParsedItem, etc.
│   │   ├── export/
│   │   │   ├── xlsx-builder.ts    # exceljs export builder
│   │   │   └── template.ts        # Template loader + types
│   │   ├── auth/
│   │   │   ├── session.ts         # Session management
│   │   │   └── magic-link.ts      # Magic link send/verify
│   │   └── utils/
│   │       ├── cache.ts           # In-memory cache (Map + TTL)
│   │       └── validation.ts      # Zod schemas for API input
│   ├── config/
│   │   └── fineli-export-template-v1.json
│   └── types/
│       └── index.ts               # Shared TypeScript types
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── .env.local.example
├── docker-compose.yml             # PostgreSQL (optional, for later)
└── data/                          # SQLite database file (gitignored)
    └── fineli.db
```

---

## Deployment Model (MVP)

For laptop development and initial deployment:

```
Local development:
  - Next.js dev server (pnpm dev)
  - SQLite file at ./data/fineli.db (zero setup, no Docker needed)
  - No external services needed (Fineli API is public)

Production (future):
  - Vercel (Next.js) or similar
  - PostgreSQL via Supabase / Neon (swap Drizzle driver)
  - Optional: Redis for caching (MVP uses in-memory Map)
```

### SQLite → PostgreSQL Migration Path

The schema is defined with Drizzle ORM. To switch:
1. Change driver in `drizzle.config.ts` and `src/lib/db/client.ts`
2. Run `pnpm db:migrate` against PostgreSQL
3. See [02-data-model.md](./02-data-model.md) for full migration details
