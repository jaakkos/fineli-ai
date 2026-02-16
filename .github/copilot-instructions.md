# Copilot Instructions — Fineli-AI

## Project Context

Finnish food diary web app (Fineli Open Data). Users log meals via natural language,
AI parses food items and maps them to the Fineli database, nutritional intake is tracked.

**Stack:** Next.js 16 (App Router), React 19, TypeScript 5 (strict), Drizzle ORM,
Tailwind CSS 4, TanStack React Query 5, Vitest, pnpm.

**UI Language:** Finnish — all user-facing text and AI prompts are in Finnish.

## Code Review Focus Areas

When reviewing pull requests, pay attention to:

### TypeScript & Type Safety
- No use of `any` — use proper types or `unknown` with type guards.
- All imports from `src/` use `@/` path alias.
- Use `import type { X }` for type-only imports.

### API Routes
- Every route must check `getSession()` and return 401 if unauthenticated.
- Input validation uses Zod (`schema.safeParse()`).
- All errors follow `{ error: { code, message } }` shape.
- Catch blocks use `handleRouteError(error)`.

### Database
- Use `getDbUnified()` — never import the PG client directly in routes.
- All queries must filter with `isNull(table.deletedAt)` for soft-delete.
- All queries must scope by `userId` from session.

### React Components
- `'use client'` only when hooks or interactivity are needed.
- Data fetching via TanStack React Query, never raw `fetch` in components
  (except the date-range prefetch in `page.tsx`).
- No `setState` inside `useEffect` to sync props — derive or compute instead.

### Security
- No secrets or API keys in code.
- Session tokens validated on every API call.
- Rate limiting applied via middleware for public endpoints.

### Testing
- Unit tests colocated in `__tests__/` next to source.
- E2E tests in `src/__tests__/`.
- ESLint zero-warnings policy.
