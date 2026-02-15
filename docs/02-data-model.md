# 02 — Data Model

## Database Strategy: SQLite-First, PostgreSQL-Ready

**MVP uses SQLite** for zero-dependency local development (no Docker needed). The schema is designed with Drizzle ORM so switching to PostgreSQL requires only changing the driver import and connection string.

### What changes between SQLite and PostgreSQL

| Feature | SQLite (MVP) | PostgreSQL (future) |
|---------|-------------|-------------------|
| Driver | `better-sqlite3` | `pg` / `postgres` |
| IDs | `text` (nanoid) | `text` (nanoid) — same |
| Enums | `text` + CHECK constraint | `text` + CHECK (or native ENUM) |
| JSON | `text` (JSON as string) | `jsonb` |
| Timestamps | `text` (ISO 8601 string) | `text` (same, Drizzle normalizes) |
| Partial indexes | Not supported | Supported (nice-to-have) |
| File | `./data/fineli.db` | Connection URL |

### Migration path

1. Change `drizzle.config.ts`: `dialect: 'sqlite'` → `dialect: 'pg'`
2. Change `src/lib/db/client.ts`: import from `drizzle-orm/better-sqlite3` → `drizzle-orm/node-postgres`
3. Change `src/lib/db/schema.ts`: import from `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core`
4. Run `pnpm db:migrate` to push schema to PostgreSQL
5. (Optional) migrate data with a one-time script

## Entity Relationship Diagram

```
users
  │
  └──< diary_days (1 user : N days)
         │
         └──< meals (1 day : N meals)
                │
                ├──< meal_items (1 meal : N items)
                ├──< conversation_messages (1 meal : N messages)
                └──── conversation_state (1 meal : 1 state)
```

---

## Drizzle ORM Schema (SQLite)

All IDs are `text` using `nanoid` (21 chars, URL-safe). This works identically on SQLite and PostgreSQL.

### users

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id:              text('id').primaryKey(), // nanoid
  anonymousId:     text('anonymous_id').unique(),
  email:           text('email').unique(),
  emailVerifiedAt: text('email_verified_at'), // ISO 8601
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:       text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt:       text('deleted_at'),
});
```

**Notes:**
- Anonymous users get a nanoid stored in a browser cookie/localStorage.
- When a user adds an email later, `anonymousId` stays and `email` is added (account linking).
- `deletedAt` enables soft delete; all queries filter `WHERE deleted_at IS NULL`.

### auth_tokens

```typescript
export const authTokens = sqliteTable('auth_tokens', {
  id:        text('id').primaryKey(), // nanoid
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:     text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(), // ISO 8601
  usedAt:    text('used_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

**Notes:**
- Magic link tokens. Single-use (set `usedAt` on verification).
- TTL: 15 minutes.

### diary_days

```typescript
export const diaryDays = sqliteTable('diary_days', {
  id:        text('id').primaryKey(), // nanoid
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:      text('date').notNull(), // YYYY-MM-DD
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
}, (table) => ({
  userDateUnique: unique().on(table.userId, table.date),
}));
```

**Notes:**
- `date` stored as `YYYY-MM-DD` text. Treated as the user's local date.
- Created implicitly when a user opens a new day.

### meals

```typescript
export const meals = sqliteTable('meals', {
  id:         text('id').primaryKey(), // nanoid
  diaryDayId: text('diary_day_id').notNull().references(() => diaryDays.id, { onDelete: 'cascade' }),
  mealType:   text('meal_type', { enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'] })
                .notNull().default('other'),
  customName: text('custom_name'),
  sortOrder:  integer('sort_order').notNull().default(0),
  createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:  text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt:  text('deleted_at'),
  version:    integer('version').notNull().default(1),
});
```

**Notes:**
- `mealType` uses Drizzle's `enum` mode (stored as text, validated at ORM level).
- `version` for optimistic concurrency control.

### meal_items

```typescript
export const mealItems = sqliteTable('meal_items', {
  id:               text('id').primaryKey(), // nanoid
  mealId:           text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  userText:         text('user_text'),
  fineliFoodId:     integer('fineli_food_id').notNull(),
  fineliNameFi:     text('fineli_name_fi').notNull(),
  fineliNameEn:     text('fineli_name_en'),
  portionAmount:    real('portion_amount').notNull(),
  portionUnitCode:  text('portion_unit_code'),
  portionUnitLabel: text('portion_unit_label'),
  portionGrams:     real('portion_grams').notNull(),
  nutrientsPer100g: text('nutrients_per_100g', { mode: 'json' }).notNull(), // JSON string
  sortOrder:        integer('sort_order').notNull().default(0),
  createdAt:        text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:        text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt:        text('deleted_at'),
});
```

**Notes:**
- `nutrientsPer100g`: stored as JSON text. Drizzle `{ mode: 'json' }` auto-serializes/deserializes.
- `real` type for numeric amounts (SQLite doesn't have NUMERIC/DECIMAL).
- `fineliFoodId = -1` reserved for custom entries (future).

### conversation_messages

```typescript
export const conversationMessages = sqliteTable('conversation_messages', {
  id:        text('id').primaryKey(), // nanoid
  mealId:    text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  role:      text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:   text('content').notNull(),
  metadata:  text('metadata', { mode: 'json' }), // JSON string
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

### conversation_state

```typescript
export const conversationState = sqliteTable('conversation_state', {
  mealId:    text('meal_id').primaryKey().references(() => meals.id, { onDelete: 'cascade' }),
  stateJson: text('state_json', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
```

### export_template_versions

```typescript
export const exportTemplateVersions = sqliteTable('export_template_versions', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  version:    text('version').notNull().unique(),
  schemaJson: text('schema_json', { mode: 'json' }).notNull(),
  createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

---

## ID Generation

```typescript
import { nanoid } from 'nanoid';

export function newId(): string {
  return nanoid(); // 21 chars, URL-safe: A-Za-z0-9_-
}
```

Why nanoid over UUID:
- Shorter (21 vs 36 chars)
- URL-safe by default
- Works identically on SQLite and PostgreSQL (just a text column)
- No database extension needed

---

## TypeScript Types

### Core Domain Types

```typescript
// Meal types matching Finnish convention
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Aamiainen',
  lunch: 'Lounas',
  dinner: 'Päivällinen',
  snack: 'Välipala',
  other: 'Muu',
};

// Database row types
interface User {
  id: string;
  anonymousId: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface DiaryDay {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

interface Meal {
  id: string;
  diaryDayId: string;
  mealType: MealType;
  customName: string | null;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MealItem {
  id: string;
  mealId: string;
  userText: string | null;
  fineliFoodId: number;
  fineliNameFi: string;
  fineliNameEn: string | null;
  portionAmount: number;
  portionUnitCode: string | null;
  portionUnitLabel: string | null;
  portionGrams: number;
  nutrientsPer100g: Record<string, number>;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Computed Types (not stored, derived at read time)

```typescript
interface MealItemWithNutrients extends MealItem {
  /** Computed: nutrientsPer100g[code] * portionGrams / 100 */
  computedNutrients: Record<string, number>;
}

interface MealWithItems extends Meal {
  items: MealItemWithNutrients[];
  /** Sum of all items' computed nutrients */
  totals: Record<string, number>;
}

interface DiaryDayFull extends DiaryDay {
  meals: MealWithItems[];
  /** Sum of all meals' totals */
  dayTotals: Record<string, number>;
}
```

### Nutrient Computation

```typescript
function computeNutrients(
  nutrientsPer100g: Record<string, number>,
  grams: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [code, valuePer100g] of Object.entries(nutrientsPer100g)) {
    result[code] = (valuePer100g * grams) / 100;
  }
  return result;
}

function sumNutrients(
  ...maps: Record<string, number>[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const map of maps) {
    for (const [code, value] of Object.entries(map)) {
      result[code] = (result[code] ?? 0) + value;
    }
  }
  return result;
}
```

---

## Nutrient Storage Strategy

**Decision: Store per-100g snapshot, compute totals at read time.**

| Approach | Pros | Cons |
|----------|------|------|
| Store per-100g + compute | Stable exports; simple edits (change grams, recompute) | Slightly more computation on read |
| Store computed totals | Fast reads | Must recompute if portion changes; snapshot drift |

We chose **store per-100g** because:
1. Portion edits are common (user corrects "120g" to "150g") — just recompute
2. Export stability: per-100g values are the Fineli snapshot; totals derived deterministically
3. Storage is minimal (55 floats in JSONB)

---

## Timezone Handling

- `diary_days.date` is PostgreSQL `DATE` — no timezone component.
- The API accepts and returns `YYYY-MM-DD` strings.
- The frontend determines "today" using the user's local timezone.
- Default assumption: `Europe/Helsinki` (for any server-side date logic).
- Consequence: a user in a different timezone sees their local date. No cross-timezone issues for MVP (single-user app).
