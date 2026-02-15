import { z } from 'zod';

export const createMealSchema = z.object({
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
  customName: z.string().optional(),
});

export const addMealItemSchema = z.object({
  fineliFoodId: z.number().int().positive(),
  fineliNameFi: z.string().min(1),
  fineliNameEn: z.string().optional(),
  userText: z.string().optional(),
  portionAmount: z.number().positive(),
  portionUnitCode: z.string().optional(),
  portionUnitLabel: z.string().optional(),
  portionGrams: z.number().positive(),
  nutrientsPer100g: z.record(z.string(), z.number()),
});

export const chatMessageSchema = z.object({
  mealId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

/** Date validation helper — YYYY-MM-DD */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Validates conversation state from DB (stateJson). Use before casting to ConversationState. */
const itemStateEnum = z.enum(['PARSED', 'DISAMBIGUATING', 'PORTIONING', 'RESOLVED', 'NO_MATCH']);
const questionTypeEnum = z.enum(['disambiguation', 'portion', 'no_match_retry', 'completion', 'companion']);

const parsedItemSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  inferredAmount: z.object({ value: z.number(), unit: z.string() }).optional(),
  state: itemStateEnum,
  fineliCandidates: z.array(z.record(z.string(), z.unknown())).optional(),
  selectedFood: z.record(z.string(), z.unknown()).optional(),
  portionGrams: z.number().optional(),
  portionUnitCode: z.string().optional(),
  portionUnitLabel: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const questionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  value: z.unknown(),
});

const pendingQuestionSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  type: questionTypeEnum,
  templateKey: z.string(),
  templateParams: z.record(z.string(), z.union([z.string(), z.number()])),
  options: z.array(questionOptionSchema).optional(),
  retryCount: z.number(),
  askedAt: z.number(),
});

export const conversationStateSchema = z.object({
  sessionId: z.string(),
  mealId: z.string(),
  items: z.array(parsedItemSchema),
  unresolvedQueue: z.array(z.string()),
  activeItemId: z.string().nullable(),
  pendingQuestion: pendingQuestionSchema.nullable(),
  companionChecks: z.array(z.string()),
  isComplete: z.boolean(),
  language: z.enum(['fi', 'en']),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;
export type AddMealItemInput = z.infer<typeof addMealItemSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
