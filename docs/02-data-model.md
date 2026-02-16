# 02 — Data Model

## Database Strategy: PostgreSQL-Only

**The project uses PostgreSQL** via `pg` and `drizzle-orm/node-postgres`. Schema is defined in `src/lib/db/schema.ts` using `drizzle-orm/pg-core`. Use `getDbUnified()` for all route handlers. Local dev requires Docker: `docker compose up -d` then `pnpm db:push`.

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

## Drizzle ORM Schema (PostgreSQL)

All IDs are `text` using `nanoid` (21 chars, URL-safe). The schema uses `pgTable` and `drizzle-orm/pg-core`.

### users

```typescript
import { pgTable, text, integer, real, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id:              text('id').primaryKey(), // nanoid
  anonymousId:     text('anonymous_id').unique(),
  email:           text('email').unique(),
  emailVerifiedAt: text('email_verified_at'), // ISO 8601
  createdAt:       text('created_at').notNull().defaultNow(),
  updatedAt:       text('updated_at').notNull().defaultNow(),
  deletedAt:       text('deleted_at'),
});
```

**Notes:**
- Anonymous users get a nanoid stored in a browser cookie/localStorage.
- When a user adds an email later, `anonymousId` stays and `email` is added (account linking).
- `deletedAt` enables soft delete; all queries filter `WHERE deleted_at IS NULL`.

### auth_tokens

```typescript
export const authTokens = pgTable('auth_tokens', {
  id:        text('id').primaryKey(), // nanoid
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:     text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(), // ISO 8601
  usedAt:    text('used_at'),
  createdAt: text('created_at').notNull().defaultNow(),
});
```

**Notes:**
- Magic link tokens. Single-use (set `usedAt` on verification).
- TTL: 15 minutes.

### diary_days

```typescript
export const diaryDays = pgTable('diary_days', {
  id:        text('id').primaryKey(), // nanoid
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:      text('date').notNull(), // YYYY-MM-DD
  createdAt: text('created_at').notNull().defaultNow(),
  updatedAt: text('updated_at').notNull().defaultNow(),
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
export const meals = pgTable('meals', {
  id:         text('id').primaryKey(), // nanoid
  diaryDayId: text('diary_day_id').notNull().references(() => diaryDays.id, { onDelete: 'cascade' }),
  mealType:   text('meal_type', { enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'] })
                .notNull().default('other'),
  customName: text('custom_name'),
  sortOrder:  integer('sort_order').notNull().default(0),
  createdAt:  text('created_at').notNull().defaultNow(),
  updatedAt:  text('updated_at').notNull().defaultNow(),
  deletedAt:  text('deleted_at'),
  version:    integer('version').notNull().default(1),
});
```

**Notes:**
- `mealType` uses Drizzle's `enum` mode (stored as text, validated at ORM level).
- `version` for optimistic concurrency control.

### meal_items

```typescript
export const mealItems = pgTable('meal_items', {
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
  nutrientsPer100g: jsonb('nutrients_per_100g').notNull(),
  sortOrder:        integer('sort_order').notNull().default(0),
  createdAt:        text('created_at').notNull().defaultNow(),
  updatedAt:        text('updated_at').notNull().defaultNow(),
  deletedAt:        text('deleted_at'),
});
```

**Notes:**
- `nutrientsPer100g`: stored as JSONB in PostgreSQL.
- `fineliFoodId = -1` reserved for custom entries (future).

### conversation_messages

```typescript
export const conversationMessages = pgTable('conversation_messages', {
  id:        text('id').primaryKey(), // nanoid
  mealId:    text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  role:      text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:   text('content').notNull(),
  metadata:  jsonb('metadata'),
  createdAt: text('created_at').notNull().defaultNow(),
});
```

### conversation_state

```typescript
export const conversationState = pgTable('conversation_state', {
  mealId:    text('meal_id').primaryKey().references(() => meals.id, { onDelete: 'cascade' }),
  stateJson: jsonb('state_json').notNull(),
  updatedAt: text('updated_at').notNull().defaultNow(),
});
```

### export_template_versions

```typescript
export const exportTemplateVersions = pgTable('export_template_versions', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  version:    text('version').notNull().unique(),
  schemaJson: jsonb('schema_json').notNull(),
  createdAt:  text('created_at').notNull().defaultNow(),
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
- Stored as a text column in PostgreSQL
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
