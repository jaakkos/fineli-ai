# 09 — Development Setup

## Prerequisites

- **Node.js** 20+ (LTS)
- **pnpm** (preferred) or npm
- **Git**
- **Docker** — required for PostgreSQL (local dev)

---

## Quick Start

```bash
# 1. Clone and install
cd fineli-ai
pnpm install

# 2. Set up environment
cp .env.local.example .env.local

# 3. Start PostgreSQL (Docker)
docker compose up -d

# 4. Push schema and seed
pnpm db:push
pnpm db:seed

# 5. Start dev server
pnpm dev
# → http://localhost:3000
```

---

## Environment Variables

`.env.local.example`:

```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://fineli:fineli@localhost:5432/fineli_ai

# Auth
SESSION_SECRET=change-me-to-a-random-string
MAGIC_LINK_FROM_EMAIL=noreply@fineli-ai.local

# Fineli API
FINELI_API_BASE_URL=https://fineli.fi/fineli/api/v1
FINELI_DEFAULT_LANG=fi

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Docker Compose (PostgreSQL)

Required for local development. Run `docker compose up -d` before `pnpm db:push`.

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fineli_ai
      POSTGRES_USER: fineli
      POSTGRES_PASSWORD: fineli
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `next` | Framework | 14.x |
| `react` | UI | 18.x |
| `typescript` | Type safety | 5.x |
| `tailwindcss` | Styling | 3.x |
| `@tanstack/react-query` | Server state | 5.x |
| `exceljs` | xlsx export | 4.x |
| `drizzle-orm` | Database ORM | latest |
| `drizzle-kit` | Schema push & migrations | latest |
| `pg` | PostgreSQL driver | latest |
| `nanoid` | ID generation | 5.x |
| `zod` | Validation | 3.x |
| `jose` | JWT handling | 5.x |
| `date-fns` | Date utilities | 3.x |

---

## Database Schema

Using Drizzle Kit:

```bash
# Push schema to PostgreSQL (no migration files)
pnpm db:push

# Studio (visual DB browser)
pnpm drizzle-kit studio
```

---

## Testing Strategy

### Unit Tests (Vitest)

| What | Coverage Target |
|------|----------------|
| Conversation engine (parser, resolver, state machine) | High — most logic lives here |
| Nutrient computation | High — math must be correct |
| Portion converter | High — many edge cases |
| Export builder | Medium — verify row structure and formatting |
| Fineli client (mocked) | Medium — response mapping |

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
pnpm test:coverage # Coverage report
```

### Integration Tests

| What | Approach |
|------|----------|
| API routes | Supertest / Next.js test client against test DB |
| Chat flow (end-to-end) | Script a full conversation: add items → resolve → verify items |
| Export output | Generate xlsx → parse it back → verify structure |

### E2E Tests (Playwright)

| What | Scenarios |
|------|-----------|
| Happy path | Open app → select meal → chat → add 2 items → export |
| Disambiguation | Chat "maito" → see options → select → portion → done |
| Error handling | Simulate Fineli timeout → verify error message |

```bash
pnpm test:e2e      # Run Playwright tests
```

---

## Project Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:seed": "tsx src/lib/db/seed.ts",
    "db:studio": "drizzle-kit studio",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Coding Conventions

| Area | Convention |
|------|-----------|
| Language | TypeScript (strict mode) |
| Naming | camelCase for variables/functions, PascalCase for types/components |
| Files | kebab-case for files (`meal-item-card.tsx`), PascalCase for components in filename is also acceptable |
| Exports | Named exports preferred over default |
| State | Server state via React Query; local state via `useState`/`useReducer` |
| Validation | Zod schemas for all API input |
| Errors | Typed error codes (see API routes doc) |
| CSS | Tailwind utility classes; no CSS modules for MVP |
| Formatting | Prettier + ESLint (Next.js config) |

---

## Development Workflow

### Week 1: Foundations

1. Project setup (Next.js, Tailwind, PostgreSQL, Drizzle)
2. Database schema + migrations
3. Fineli client with caching
4. Basic UI layout (date picker, meal tabs, chat panel, items list)
5. Conversation engine: parser + disambiguator
6. Wire up: chat input → parse → Fineli search → show options

### Week 2: Portions & Resolution

1. Portion converter (Fineli units, volume, grams)
2. Conversation engine: portioning flow
3. Full resolution pipeline (PARSED → RESOLVED)
4. Save resolved items to DB
5. Display items in sidebar
6. Edit/delete items

### Week 3: Nutrients & Export

1. Nutrient computation (per-item, per-meal, per-day)
2. Nutrient summary component
3. Export builder (exceljs)
4. Export API route
5. Export button with date range picker
6. End-to-end test: chat → resolve → export → verify xlsx

### Week 4: Polish

1. Auth (anonymous session + magic link)
2. Missing items detection (food companions)
3. Error handling (network errors, Fineli downtime)
4. Loading states and animations
5. Mobile responsiveness
6. Accessibility pass
7. Basic Playwright E2E tests

---

## Useful Commands

```bash
# Check Fineli API directly
curl -s "https://fineli.fi/fineli/api/v1/foods?q=maito&lang=fi" | python3 -m json.tool

# Check a specific food
curl -s "https://fineli.fi/fineli/api/v1/foods/11049" | python3 -m json.tool

# List all components
curl -s "https://fineli.fi/fineli/api/v1/components/?lang=fi" | python3 -m json.tool

# PostgreSQL shell (inspect local DB)
docker exec -it $(docker compose ps -q postgres) psql -U fineli -d fineli_ai
```
