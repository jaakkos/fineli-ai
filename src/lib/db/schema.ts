import { pgTable, text, integer, real, unique, serial, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const NOW = sql`now()` as unknown as string;

// All timestamps use { withTimezone: true, mode: 'string' }:
// - withTimezone: stores as TIMESTAMPTZ in PG (UTC internally)
// - mode: 'string': Drizzle passes strings through (app uses ISO strings)
//   and returns PG-format strings on read (normalized to ISO in client.ts)
const TS = { withTimezone: true, mode: 'string' as const };

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  anonymousId: text('anonymous_id').unique(),
  email: text('email').unique(),
  emailVerifiedAt: timestamp('email_verified_at', TS),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
  updatedAt: timestamp('updated_at', TS).notNull().default(NOW),
  deletedAt: timestamp('deleted_at', TS),
});

// ---------------------------------------------------------------------------
// auth_tokens
// ---------------------------------------------------------------------------

export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  pendingEmail: text('pending_email'),  // email to set on user once token is verified
  expiresAt: timestamp('expires_at', TS).notNull(),
  usedAt: timestamp('used_at', TS),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
});

// ---------------------------------------------------------------------------
// diary_days
// ---------------------------------------------------------------------------

export const diaryDays = pgTable(
  'diary_days',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD — kept as text intentionally
    createdAt: timestamp('created_at', TS).notNull().default(NOW),
    updatedAt: timestamp('updated_at', TS).notNull().default(NOW),
    deletedAt: timestamp('deleted_at', TS),
  },
  (table) => [unique('diary_days_user_date').on(table.userId, table.date)]
);

// ---------------------------------------------------------------------------
// meals
// ---------------------------------------------------------------------------

export const meals = pgTable('meals', {
  id: text('id').primaryKey(),
  diaryDayId: text('diary_day_id')
    .notNull()
    .references(() => diaryDays.id, { onDelete: 'cascade' }),
  mealType: text('meal_type', {
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'],
  })
    .notNull()
    .default('other'),
  customName: text('custom_name'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
  updatedAt: timestamp('updated_at', TS).notNull().default(NOW),
  deletedAt: timestamp('deleted_at', TS),
  version: integer('version').notNull().default(1),
});

// ---------------------------------------------------------------------------
// meal_items
// ---------------------------------------------------------------------------

export const mealItems = pgTable('meal_items', {
  id: text('id').primaryKey(),
  mealId: text('meal_id')
    .notNull()
    .references(() => meals.id, { onDelete: 'cascade' }),
  userText: text('user_text'),
  fineliFoodId: integer('fineli_food_id').notNull(),
  fineliNameFi: text('fineli_name_fi').notNull(),
  fineliNameEn: text('fineli_name_en'),
  portionAmount: real('portion_amount').notNull(),
  portionUnitCode: text('portion_unit_code'),
  portionUnitLabel: text('portion_unit_label'),
  portionGrams: real('portion_grams').notNull(),
  nutrientsPer100g: jsonb('nutrients_per_100g')
    .$type<Record<string, number>>()
    .notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
  updatedAt: timestamp('updated_at', TS).notNull().default(NOW),
  deletedAt: timestamp('deleted_at', TS),
});

// ---------------------------------------------------------------------------
// conversation_messages
// ---------------------------------------------------------------------------

export const conversationMessages = pgTable('conversation_messages', {
  id: text('id').primaryKey(),
  mealId: text('meal_id')
    .notNull()
    .references(() => meals.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
});

// ---------------------------------------------------------------------------
// conversation_state
// ---------------------------------------------------------------------------

export const conversationState = pgTable('conversation_state', {
  mealId: text('meal_id')
    .primaryKey()
    .references(() => meals.id, { onDelete: 'cascade' }),
  stateJson: jsonb('state_json').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', TS).notNull().default(NOW),
});

// ---------------------------------------------------------------------------
// export_template_versions
// ---------------------------------------------------------------------------

export const exportTemplateVersions = pgTable('export_template_versions', {
  id: serial('id').primaryKey(),
  version: text('version').notNull().unique(),
  schemaJson: jsonb('schema_json').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', TS).notNull().default(NOW),
});
