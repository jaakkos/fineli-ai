import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import * as schema from '@/lib/db/schema';
import { newId } from '@/types';

describe('Database CRUD operations', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const { db: testDb } = createTestDb();
    db = testDb;
  });

  describe('users', () => {
    it('creates a user with nanoid', () => {
      const userId = newId();
      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .get();

      expect(user).toBeDefined();
      expect(user!.id).toBe(userId);
    });

    it('queries user by id', () => {
      const userId = newId();
      db.insert(schema.users)
        .values({
          id: userId,
          email: 'test@example.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .get();

      expect(user?.email).toBe('test@example.com');
    });
  });

  describe('diary_days', () => {
    it('creates diary_day for user', () => {
      const userId = newId();
      const dayId = newId();
      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const now = new Date().toISOString();
      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const day = db
        .select()
        .from(schema.diaryDays)
        .where(eq(schema.diaryDays.id, dayId))
        .get();

      expect(day).toBeDefined();
      expect(day!.userId).toBe(userId);
      expect(day!.date).toBe('2025-02-15');
    });

    it('enforces unique constraint on user_id + date', () => {
      const userId = newId();
      const dayId1 = newId();
      const dayId2 = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId1,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      expect(() => {
        db.insert(schema.diaryDays)
          .values({
            id: dayId2,
            userId,
            date: '2025-02-15',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }).toThrow();
    });

    it('cascades delete when user is deleted', () => {
      const userId = newId();
      const dayId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.delete(schema.users).where(eq(schema.users.id, userId)).run();

      const day = db
        .select()
        .from(schema.diaryDays)
        .where(eq(schema.diaryDays.id, dayId))
        .get();

      expect(day).toBeUndefined();
    });
  });

  describe('meals', () => {
    it('creates meal for diary_day', () => {
      const userId = newId();
      const dayId = newId();
      const mealId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.meals)
        .values({
          id: mealId,
          diaryDayId: dayId,
          mealType: 'lunch',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
          version: 1,
        })
        .run();

      const meal = db
        .select()
        .from(schema.meals)
        .where(eq(schema.meals.id, mealId))
        .get();

      expect(meal).toBeDefined();
      expect(meal!.diaryDayId).toBe(dayId);
      expect(meal!.mealType).toBe('lunch');
    });

    it('version field on meals starts at 1', () => {
      const userId = newId();
      const dayId = newId();
      const mealId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.meals)
        .values({
          id: mealId,
          diaryDayId: dayId,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const meal = db
        .select({ version: schema.meals.version })
        .from(schema.meals)
        .where(eq(schema.meals.id, mealId))
        .get();

      expect(meal?.version).toBe(1);
    });
  });

  describe('meal_items', () => {
    it('creates meal_item for meal with JSON nutrients_per_100g', () => {
      const userId = newId();
      const dayId = newId();
      const mealId = newId();
      const itemId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.meals)
        .values({
          id: mealId,
          diaryDayId: dayId,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const nutrientsPer100g = {
        ENERC: 366,
        FAT: 0.4,
        CHOAVL: 18.3,
        PROT: 1.2,
        FIBC: 1.6,
      };

      db.insert(schema.mealItems)
        .values({
          id: itemId,
          mealId,
          fineliFoodId: 11049,
          fineliNameFi: 'Banaani, kuorittu',
          fineliNameEn: 'Banana, Without Skin',
          portionAmount: 125,
          portionUnitCode: 'KPL_M',
          portionUnitLabel: 'keskikokoinen (kpl)',
          portionGrams: 125,
          nutrientsPer100g,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const item = db
        .select()
        .from(schema.mealItems)
        .where(eq(schema.mealItems.id, itemId))
        .get();

      expect(item).toBeDefined();
      expect(item!.fineliFoodId).toBe(11049);
      expect(item!.portionGrams).toBe(125);
      expect(item!.nutrientsPer100g).toEqual(nutrientsPer100g);
    });

    it('reads meal_item back and verifies nutrients_per_100g is parsed correctly', () => {
      const userId = newId();
      const dayId = newId();
      const mealId = newId();
      const itemId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.diaryDays)
        .values({
          id: dayId,
          userId,
          date: '2025-02-15',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.meals)
        .values({
          id: mealId,
          diaryDayId: dayId,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const nutrients = { ENERC: 350, FAT: 0.3, PROT: 1.1 };
      db.insert(schema.mealItems)
        .values({
          id: itemId,
          mealId,
          fineliFoodId: 28934,
          fineliNameFi: 'Banaani, punnittu kuorineen',
          portionAmount: 1,
          portionGrams: 150,
          nutrientsPer100g: nutrients,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const item = db
        .select()
        .from(schema.mealItems)
        .where(eq(schema.mealItems.id, itemId))
        .get();

      expect(item!.nutrientsPer100g).toBeInstanceOf(Object);
      expect(item!.nutrientsPer100g.ENERC).toBe(350);
      expect(item!.nutrientsPer100g.FAT).toBe(0.3);
      expect(item!.nutrientsPer100g.PROT).toBe(1.1);
    });
  });

  describe('soft-delete', () => {
    it('filters with isNull(deletedAt) after soft-delete', () => {
      const userId = newId();
      const now = new Date().toISOString();

      db.insert(schema.users)
        .values({
          id: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Soft-delete: set deletedAt
      db.update(schema.users)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(schema.users.id, userId))
        .run();

      const activeUsers = db
        .select()
        .from(schema.users)
        .where(isNull(schema.users.deletedAt))
        .all();

      expect(activeUsers).toHaveLength(0);

      const allUsers = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .all();

      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].deletedAt).toBe(now);
    });
  });
});
