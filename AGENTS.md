# AGENTS.md — AI Coding Guidelines for Fineli-AI

## Project Overview

Finnish food diary web app powered by Fineli Open Data. Users log meals via natural language, AI parses food items and maps them to the Fineli database, and the app tracks nutritional intake.

**Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Drizzle ORM (SQLite local / PostgreSQL production), Tailwind CSS 4, TanStack React Query 5, Vitest, pnpm.

## Architecture

```
src/
  app/           # Next.js App Router — pages and API routes
    api/         # REST endpoints (diary, chat, fineli, export, auth)
  components/
    diary/       # Feature components (ChatPanel, MealItemsList, DatePicker)
    ui/          # Generic primitives (Button, Card, Spinner)
  lib/
    ai/          # AI parsing, ranking, prompts (OpenAI/Anthropic)
    auth/        # Session (jose JWT), magic-link (Resend)
    conversation/ # Conversation engine, parser, resolver, questions
    db/          # Drizzle client, schema (SQLite + PostgreSQL)
    export/      # XLSX builder and templates
    fineli/      # Fineli API client, local index, search, nutrients
    hooks/       # React hooks (use-diary, use-chat, use-auth)
    utils/       # Shared utilities (validation, error handling, cache)
  types/         # Shared TypeScript types and constants
scripts/         # Build scripts (build-fineli-index.ts)
docs/            # Design documentation
```

## Code Conventions

### Language & Imports

- TypeScript strict mode; no `any` unless unavoidable.
- Use `@/` path alias for all imports from `src/` — never relative `../..` across modules.
- Import order: React/Next.js → third-party → `@/types` → `@/lib` → `@/components`.
- Use `import type { X }` for type-only imports.

### Naming

| What | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `ExportButton.tsx` |
| Hooks | `use` + PascalCase | `useDiaryDay` |
| Lib files | camelCase or kebab-case | `ai-parser.ts`, `local-index.ts` |
| Functions | camelCase | `handleRouteError`, `parseUserMessage` |
| Constants | UPPER_SNAKE_CASE | `MEAL_TYPE_LABELS`, `ERROR_CODES` |
| Types/interfaces | PascalCase | `MealWithItems`, `SessionPayload` |

### Error Handling

All API errors follow a consistent shape:

```typescript
{ error: { code: string; message: string; details?: unknown } }
```

Standard codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

Use `handleRouteError(error)` from `@/lib/utils/api-error` in every route's catch block.

### Validation

Use Zod for input validation. Call `schema.safeParse()` and return `VALIDATION_ERROR` with `parsed.error.flatten()` on failure.

## API Route Pattern

Every API route follows this structure:

```typescript
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '...' } }, { status: 401 });

    // 1. Parse & validate input (Zod)
    // 2. Business logic (getDbUnified(), etc.)
    // 3. Return NextResponse.json({ ... })
  } catch (error) {
    return handleRouteError(error);
  }
}
```

## Database

- Use `getDbUnified()` for all route handlers — it works for both SQLite and PostgreSQL.
- Schema is defined in `src/lib/db/schema.ts` (SQLite) and `src/lib/db/schema.pg.ts` (PostgreSQL).
- Deploy schema with `pnpm db:push`, not migration files.
- All tables use soft-delete (`deletedAt` column) — always filter with `isNull(table.deletedAt)`.

## Components

- Use `'use client'` only when the component needs hooks or interactivity.
- Props interface: `interface XxxProps { ... }` above the component.
- Feature components in `components/diary/`, generic primitives in `components/ui/`.
- Styling: Tailwind utility classes inline; no CSS modules.

## Hooks

- All data fetching uses TanStack React Query (`useQuery`, `useMutation`).
- Query keys follow `['resource', 'sub', id]` pattern (e.g., `['diary', 'day', date]`).
- Mutations use optimistic updates where appropriate (`onMutate`, `onError` rollback, `onSettled` invalidate).

## Testing

- Unit tests: colocated in `__tests__/` next to source (e.g., `lib/fineli/__tests__/search.test.ts`).
- E2E tests: `src/__tests__/` with helpers in `src/__tests__/helpers/`.
- Framework: Vitest with Node environment.
- Run: `pnpm test:run` (unit), `pnpm test:e2e` (E2E, needs dev server).
- ESLint: zero warnings policy (`eslint --max-warnings 0`).

## Fineli Domain

- Food data comes from Fineli Open Data (THL, Finland), CC-BY 4.0.
- Local index built from CSV at build time (`scripts/build-fineli-index.ts`), stored as `data/fineli/index.json`.
- Search uses FlexSearch with forward tokenization, plus heuristic scoring (`scoreMatch`).
- AI parses natural language → food items with `searchHint` and `portionEstimateGrams`.
- Portion sizes use Fineli unit codes: `PORTS`/`PORTM`/`PORTL` (small/medium/large), `KPL_S`/`KPL_M`/`KPL_L` (per-piece), `DL`, `G`.
- UI language is Finnish; AI prompts and user-facing text are in Finnish.

## Deployment

- Render Blueprint (`render.yaml`): PostgreSQL + Node web service.
- Build: `pnpm install --prod=false && pnpm db:push && pnpm db:seed && pnpm build`.
- `pnpm build` runs index builder then `next build`.
