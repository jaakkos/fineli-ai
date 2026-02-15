import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id:              text('id').primaryKey(),
  anonymousId:     text('anonymous_id').unique(),
  email:           text('email').unique(),
  emailVerifiedAt: text('email_verified_at'),
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:       text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt:       text('deleted_at'),
});

// ---------------------------------------------------------------------------
// auth_tokens
// ---------------------------------------------------------------------------

export const authTokens = sqliteTable('auth_tokens', {
  id:           text('id').primaryKey(),
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token:        text('token').notNull().unique(),
  pendingEmail: text('pending_email'),  // email to set on user once token is verified
  expiresAt:    text('expires_at').notNull(),
  usedAt:       text('used_at'),
  createdAt:    text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ---------------------------------------------------------------------------
// diary_days
// ---------------------------------------------------------------------------

export const diaryDays = sqliteTable('diary_days', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:      text('date').notNull(), // YYYY-MM-DD
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
}, (table) => [
  unique('diary_days_user_date').on(table.userId, table.date),
]);

// ---------------------------------------------------------------------------
// meals
// ---------------------------------------------------------------------------

export const meals = sqliteTable('meals', {
  id:         text('id').primaryKey(),
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

// ---------------------------------------------------------------------------
// meal_items
// ---------------------------------------------------------------------------

export const mealItems = sqliteTable('meal_items', {
  id:               text('id').primaryKey(),
  mealId:           text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  userText:         text('user_text'),
  fineliFoodId:     integer('fineli_food_id').notNull(),
  fineliNameFi:     text('fineli_name_fi').notNull(),
  fineliNameEn:     text('fineli_name_en'),
  portionAmount:    real('portion_amount').notNull(),
  portionUnitCode:  text('portion_unit_code'),
  portionUnitLabel: text('portion_unit_label'),
  portionGrams:     real('portion_grams').notNull(),
  nutrientsPer100g: text('nutrients_per_100g', { mode: 'json' }).notNull().$type<Record<string, number>>(),
  sortOrder:        integer('sort_order').notNull().default(0),
  createdAt:        text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:        text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt:        text('deleted_at'),
});

// ---------------------------------------------------------------------------
// conversation_messages
// ---------------------------------------------------------------------------

export const conversationMessages = sqliteTable('conversation_messages', {
  id:        text('id').primaryKey(),
  mealId:    text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  role:      text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:   text('content').notNull(),
  metadata:  text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ---------------------------------------------------------------------------
// conversation_state
// ---------------------------------------------------------------------------

export const conversationState = sqliteTable('conversation_state', {
  mealId:    text('meal_id').primaryKey().references(() => meals.id, { onDelete: 'cascade' }),
  stateJson: text('state_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ---------------------------------------------------------------------------
// export_template_versions
// ---------------------------------------------------------------------------

export const exportTemplateVersions = sqliteTable('export_template_versions', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  version:    text('version').notNull().unique(),
  schemaJson: text('schema_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
});
