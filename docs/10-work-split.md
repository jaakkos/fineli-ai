# 10 — Work Split: Codex + Claude

## Principle

Split by **dependency boundary**: Codex builds isolated library modules with clear TypeScript interfaces. Claude builds the application layer that wires those modules together with UI and API routes.

Both agents can work **in parallel** because the contract between them is defined by TypeScript interfaces in `src/types/index.ts`.

---

## Shared Contract (build first, both agents import from here)

**File: `src/types/index.ts`** — Must be created before either agent starts.

Contains all shared types that form the boundary between library code and app code:
- `MealType`, `MEAL_TYPE_LABELS`
- `FineliFood`, `FineliUnit`, `FineliComponent`
- `ParsedItem`, `ConversationState`, `PendingQuestion`, `QuestionOption`
- `MealItem`, `Meal`, `DiaryDay`, `User`
- `MealItemWithNutrients`, `MealWithItems`, `DiaryDayFull`
- `ExportInput`, `ExportOptions`
- `PortionConversionResult`
- Nutrient component constants (`COMPONENT_ORDER`, `COMPONENT_IDS`)

---

## Codex Tasks (Library Modules)

Codex handles **pure logic** with well-defined inputs/outputs and unit tests. These modules have no React/Next.js dependencies and can be tested in isolation.

### Task C1: Project Scaffolding

**Priority: First (blocks everything else)**

Create the Next.js project with all configuration:
- `pnpm create next-app` with TypeScript, Tailwind, App Router
- `drizzle.config.ts` for SQLite
- `package.json` with all dependencies
- `tsconfig.json` strict mode
- `.env.local.example`
- `.gitignore` (include `data/*.db`)
- `src/types/index.ts` — shared type definitions

**Output:** A working `pnpm dev` with empty page + all deps installed.

### Task C2: Database Schema + Migrations

**Depends on: C1**

- `src/lib/db/schema.ts` — all tables (Drizzle SQLite schema from 02-data-model.md)
- `src/lib/db/client.ts` — database connection (better-sqlite3)
- `src/lib/db/seed.ts` — seed script for export_template_versions
- `src/lib/db/helpers.ts` — `newId()` function using nanoid
- Run `pnpm db:migrate` to verify schema creates correctly
- Test: create a user, diary_day, meal, meal_item programmatically

**Output:** Working database with all tables, seeded template.

### Task C3: Fineli API Client + Types

**Depends on: C1 (types only)**

- `src/lib/fineli/types.ts` — raw Fineli API response types + our normalized types
- `src/lib/fineli/client.ts` — FineliClient class:
  - `searchFoods(query, lang?)` → `FineliFood[]`
  - `getFood(id)` → `FineliFood` (with all 55 nutrients)
  - `getComponents()` → `FineliComponent[]`
  - Response normalization (raw API → our types)
- `src/lib/fineli/search.ts` — FoodSearchService:
  - `rank(results, query)` → top 5 scored results
  - `normalizeQuery(input)` — lowercase, trim, collapse
  - `FOOD_ALIASES` map
- `src/lib/utils/cache.ts` — MemoryCache with TTL and stale-serve
- Unit tests: mock API responses, verify normalization + ranking

**Output:** `FineliClient` that can search and fetch foods with caching.

### Task C4: Portion Converter

**Depends on: C1 (types only)**

- `src/lib/fineli/portions.ts` — PortionConverter class:
  - `convert(amount, unitInput, fineliUnits)` → `PortionConversionResult | null`
  - `UNIT_ALIASES` map (Finnish + English unit names → Fineli codes)
  - `DENSITY_TABLE` for volume→weight when no Fineli DL unit
  - Handles: direct grams, Fineli unit match, volume with density, fractions
- Unit tests: extensive (see 08-corner-cases.md section 2):
  - "120g" → 120g
  - "keskikokoinen" for banana → 125g
  - "2 dl" for milk → DL unit mass × 2
  - "puolikas" → 0.5 × reference portion
  - "0g" → rejected
  - Unit not available → null

**Output:** Fully tested portion converter.

### Task C5: Nutrient Calculator

**Depends on: C1 (types only)**

- `src/lib/fineli/nutrients.ts`:
  - `computeNutrients(nutrientsPer100g, grams)` → per-item nutrients
  - `sumNutrients(...maps)` → aggregated nutrients
  - `mapDataToComponents(data[], componentOrder)` → `Record<code, number>`
  - Energy kJ → kcal conversion
- Unit tests: verify math against known Fineli values

**Output:** Nutrient computation functions.

### Task C6: Message Parser

**Depends on: C1 (types only)**

- `src/lib/conversation/parser.ts`:
  - `parseMealText(text)` → `ParsedItem[]` (split items, extract amounts)
  - `parseAnswer(text, expectedType)` → `ParsedAnswer` (disambiguation, portion, correction)
  - `classifyIntent(message, pendingQuestion)` → intent type
  - All regex patterns from 05-conversation-engine.md
  - `ITEM_SPLITTERS`, `AMOUNT_PATTERN`, `AMOUNT_SUFFIX_PATTERN`
- Unit tests: extensive (see conversation engine doc for all examples):
  - "kaurapuuroa maidolla ja banaani" → 3 items
  - "120g kanaa ja riisiä" → 2 items, first with amount
  - "1" as disambiguation answer → selection index 0
  - "keskikokoinen" as portion answer → KPL_M
  - "poista banaani" → removal intent

**Output:** All text parsing logic with tests.

### Task C7: Export Builder

**Depends on: C1 (types), C5 (nutrients)**

- `src/config/fineli-export-template-v1.json` — the full template
- `src/lib/export/template.ts` — template loader + column types
- `src/lib/export/xlsx-builder.ts`:
  - `generateExport(input, options?)` → `Buffer`
  - Header row with styling
  - Food item rows, meal subtotal rows, day total rows
  - Number formatting per column
  - Null handling (empty cells, not zero)
  - Frozen panes
- Integration test: generate xlsx → parse back with exceljs → verify:
  - Correct headers
  - Row order (items → subtotal → day total)
  - Nutrient values match expected computation
  - Null cells are empty

**Output:** Working xlsx export matching Fineli format.

---

## Claude Tasks (Application Layer)

Claude handles **integration, UI, and wiring** — components that connect library modules together with React, Next.js API routes, and the conversation state machine.

### Task L1: UI Components (Static)

**Depends on: C1 (scaffolding)**

Build all React components with mock data (no API calls yet):
- `src/components/diary/DatePicker.tsx`
- `src/components/diary/MealSelector.tsx`
- `src/components/diary/ChatPanel.tsx`
- `src/components/diary/ChatMessage.tsx`
- `src/components/diary/ChatInput.tsx`
- `src/components/diary/QuickReplyButtons.tsx`
- `src/components/diary/MealItemsList.tsx`
- `src/components/diary/MealItemCard.tsx`
- `src/components/diary/NutrientSummary.tsx`
- `src/components/diary/ExportButton.tsx`
- `src/components/ui/Button.tsx`, `Card.tsx`, `Spinner.tsx`
- `src/app/page.tsx` — main layout assembling all components
- Responsive layout (desktop side-by-side, mobile stacked)

All components use TypeScript interfaces from `src/types/index.ts`.
Wire with mock data to verify layout and interactions.

**Output:** Full UI with mock data, responsive, accessible.

### Task L2: Conversation Engine (State Machine)

**Depends on: C1 (types), C6 (parser)**

- `src/lib/conversation/engine.ts` — main `processMessage()` function:
  - Intent classification → dispatch to handler
  - Queue management (add, advance, remove items)
  - Auto-resolution (single match + grams already known)
- `src/lib/conversation/resolver.ts` — item state transitions:
  - PARSED → DISAMBIGUATING / PORTIONING / RESOLVED / NO_MATCH
  - DISAMBIGUATING → PORTIONING / RESOLVED
  - PORTIONING → RESOLVED
- `src/lib/conversation/questions.ts` — question template generator:
  - Finnish templates for disambiguation, portion, no-match, completion
  - Quick-reply option generation from Fineli units
- `src/lib/conversation/companions.ts` — FOOD_COMPANIONS map + logic
- Integration tests: script full conversations:
  - "puuroa ja banaani" → disambiguate puuro → portion → disambiguate banaani → portion → done
  - "120g kanaa" → single match + grams → auto-resolve
  - "poista puuro" mid-conversation → removal

**Output:** Working state machine that drives the conversation.

### Task L3: API Routes

**Depends on: C2 (database), C3 (Fineli client), L2 (engine)**

All Next.js API routes from 03-api-routes.md:

- `src/app/api/auth/anonymous/route.ts`
- `src/app/api/auth/magic-link/route.ts`
- `src/app/api/auth/verify/route.ts`
- `src/app/api/diary/days/route.ts`
- `src/app/api/diary/days/[date]/route.ts`
- `src/app/api/diary/days/[date]/meals/route.ts`
- `src/app/api/diary/meals/[id]/route.ts`
- `src/app/api/diary/meals/[id]/items/route.ts`
- `src/app/api/diary/items/[id]/route.ts`
- `src/app/api/chat/message/route.ts` — wires parser + engine + Fineli client
- `src/app/api/chat/state/[mealId]/route.ts`
- `src/app/api/fineli/search/route.ts`
- `src/app/api/fineli/food/[id]/route.ts`
- `src/app/api/export/xlsx/route.ts` — wires export builder
- `src/lib/auth/session.ts` — session middleware
- `src/lib/utils/validation.ts` — Zod schemas for all inputs

**Output:** All endpoints working end-to-end.

### Task L4: Frontend Wiring (React Query + Real Data)

**Depends on: L1 (UI), L3 (API routes)**

Replace mock data with real API calls:
- `src/lib/hooks/use-diary.ts` — React Query hooks for diary CRUD
- `src/lib/hooks/use-chat.ts` — chat message send + optimistic updates
- `src/lib/hooks/use-fineli.ts` — food search
- URL state management (`?date=&meal=`)
- Connect ChatPanel → POST /api/chat/message → render response
- Connect MealItemsList → GET /api/diary/days/:date
- Connect ExportButton → GET /api/export/xlsx → download
- Error handling + loading states

**Output:** Fully working app, end-to-end.

---

## Dependency Graph

```
C1 (Scaffolding) ──┬──→ C2 (DB Schema) ──────────────────→ L3 (API Routes)
                    │                                              │
                    ├──→ C3 (Fineli Client) ──────────────→ L3    │
                    │                                              │
                    ├──→ C4 (Portion Converter) ──→ L2 (Engine) → L3
                    │                                              │
                    ├──→ C5 (Nutrient Calc) ──→ C7 (Export) ──→ L3
                    │                                              │
                    ├──→ C6 (Message Parser) ──→ L2 (Engine)      │
                    │                                              │
                    └──→ L1 (UI Components, static) ────────→ L4 (Wiring)
                                                                   │
                                                            L3 ──→ L4
```

## Parallel Execution Plan

```
TIME →

Codex:  [C1] → [C2, C3, C4, C5, C6 in parallel] → [C7]
Claude:         [L1 (after C1)]  → [L2 (after C6)] → [L3 (after C2,C3,L2)] → [L4]
```

### Phase 1 — Scaffold (both blocked until done)
| Agent | Task | Time |
|-------|------|------|
| Codex | **C1**: Project scaffolding + shared types | ~30 min |

### Phase 2 — Parallel Libraries + UI (fully parallel)
| Agent | Task | Time |
|-------|------|------|
| Codex | **C2**: DB schema + migrations | ~1 hour |
| Codex | **C3**: Fineli client + caching | ~2 hours |
| Codex | **C4**: Portion converter | ~1 hour |
| Codex | **C5**: Nutrient calculator | ~30 min |
| Codex | **C6**: Message parser | ~2 hours |
| Claude | **L1**: All UI components (static) | ~3 hours |

### Phase 3 — Integration (depends on Phase 2)
| Agent | Task | Depends On |
|-------|------|------------|
| Codex | **C7**: Export builder | C5 |
| Claude | **L2**: Conversation engine | C6 |

### Phase 4 — Wiring (depends on Phase 3)
| Agent | Task | Depends On |
|-------|------|------------|
| Claude | **L3**: API routes | C2, C3, C4, C5, L2 |
| Claude | **L4**: Frontend wiring | L1, L3 |

---

## Interface Contract Checklist

Before Phase 3 starts, verify these interfaces match between Codex and Claude code:

- [ ] `FineliClient.searchFoods()` return type matches what `engine.ts` expects
- [ ] `FineliClient.getFood()` return type matches what `resolver.ts` uses
- [ ] `PortionConverter.convert()` signature matches what `resolver.ts` calls
- [ ] `parseMealText()` return type matches `ParsedItem` in engine
- [ ] `computeNutrients()` signature matches what API routes use
- [ ] `generateExport()` input matches what the export API route provides
- [ ] Database schema field names match TypeScript types in `src/types/index.ts`
- [ ] All shared types are re-exported from `src/types/index.ts`

---

## Task Specification Format (for agent prompts)

Each task should be given to the agent with:

```
## Task: [ID] [Name]
### Goal
What to build (1-2 sentences)
### Files to create/modify
- file paths
### Interfaces
- Input/output types (from shared types)
### Design doc reference
- Section in docs/ to follow
### Tests required
- What to test
### Definition of done
- How to verify it works
```
