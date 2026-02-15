// =============================================================================
// Shared types — the contract between library modules and application layer.
// All agents (codex & claude) import from here.
// =============================================================================

import { nanoid } from 'nanoid';

/** Generate a new 21-char URL-safe ID */
export function newId(): string {
  return nanoid();
}

// ---------------------------------------------------------------------------
// Meal types
// ---------------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Aamiainen',
  lunch: 'Lounas',
  dinner: 'Päivällinen',
  snack: 'Välipala',
  other: 'Muu',
};

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];

// ---------------------------------------------------------------------------
// Fineli types (our normalized internal representation)
// ---------------------------------------------------------------------------

export interface FineliFood {
  id: number;
  nameFi: string;
  nameEn: string | null;
  nameSv: string | null;
  type: 'FOOD' | 'DISH';
  preparationMethods: string[];
  units: FineliUnit[];
  /** Nutrients per 100g, keyed by component code (e.g. "ENERC", "FAT") */
  nutrients: Record<string, number>;
  /** Summary for quick display */
  energyKj: number;
  energyKcal: number;
  fat: number;
  protein: number;
  carbohydrate: number;
}

export interface FineliUnit {
  code: string;       // e.g. 'KPL_S', 'KPL_M', 'KPL_L', 'DL', 'G'
  labelFi: string;
  labelEn: string;
  massGrams: number;  // Weight in grams for 1 unit
}

export interface FineliComponent {
  id: number;
  code: string;        // e.g. 'ENERC', 'FAT'
  nameFi: string;
  nameEn: string;
  unit: string;        // 'g', 'mg', 'µg', 'kJ'
}

// ---------------------------------------------------------------------------
// Fineli constants
// ---------------------------------------------------------------------------

/** All 55 nutrient component codes in Fineli data[] array order */
export const COMPONENT_ORDER: string[] = [
  'ENERC', 'FAT', 'CHOAVL', 'PROT', 'ALC', 'OA', 'SUGOH', 'SUGAR',
  'FRUS', 'GALS', 'GLUS', 'LACS', 'MALS', 'SUCS', 'STARCH', 'FIBC',
  'FIBINS', 'PSACNCS', 'FAFRE', 'FAPU', 'FAMCIS', 'FASAT', 'FATRN',
  'FAPUN3', 'FAPUN6', 'F18D2CN6', 'F18D3N3', 'F20D5N3', 'F22D6N3',
  'CHOLE', 'STERT', 'CA', 'FE', 'ID', 'K', 'MG', 'NA', 'NACL',
  'P', 'SE', 'ZN', 'TRP', 'FOL', 'NIAEQ', 'NIA', 'VITPYRID',
  'RIBF', 'THIA', 'VITA', 'CAROTENS', 'VITB12', 'VITC', 'VITD',
  'VITE', 'VITK',
];

/** Fineli component database IDs (for reference/debugging) */
export const COMPONENT_IDS: Record<string, number> = {
  ENERC: 2331, FAT: 2157, CHOAVL: 2034, PROT: 2230, ALC: 2005,
  OA: 2222, SUGOH: 2260, SUGAR: 2259, FRUS: 2172, GALS: 2173,
  GLUS: 2178, LACS: 2196, MALS: 2206, SUCS: 2257, STARCH: 2252,
  FIBC: 2168, FIBINS: 2266, PSACNCS: 2279, FAFRE: 2143, FAPU: 2151,
  FAMCIS: 2150, FASAT: 2156, FATRN: 2158, FAPUN3: 2152, FAPUN6: 2155,
  F18D2CN6: 2095, F18D3N3: 2097, F20D5N3: 2116, F22D6N3: 2131,
  CHOLE: 2038, STERT: 2254, CA: 2023, FE: 2160, ID: 2189,
  K: 2192, MG: 2212, NA: 2216, NACL: 2217, P: 2223,
  SE: 2244, ZN: 2282, TRP: 2263, FOL: 2273, NIAEQ: 2275,
  NIA: 2291, VITPYRID: 2276, RIBF: 2277, THIA: 2278, VITA: 2298,
  CAROTENS: 2029, VITB12: 2269, VITC: 2270, VITD: 2271, VITE: 2299,
  VITK: 2274,
};

// ---------------------------------------------------------------------------
// Database entity types (match Drizzle schema)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  anonymousId: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DiaryDay {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Meal {
  id: string;
  diaryDayId: string;
  mealType: MealType;
  customName: string | null;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MealItem {
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ---------------------------------------------------------------------------
// Computed types (derived at read time, not stored)
// ---------------------------------------------------------------------------

export interface MealItemWithNutrients extends MealItem {
  /** Computed: nutrientsPer100g[code] * portionGrams / 100 */
  computedNutrients: Record<string, number>;
}

export interface MealWithItems extends Meal {
  items: MealItemWithNutrients[];
  /** Sum of all items' computed nutrients */
  totals: Record<string, number>;
}

export interface DiaryDayFull extends DiaryDay {
  meals: MealWithItems[];
  /** Sum of all meals' totals */
  dayTotals: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Conversation engine types
// ---------------------------------------------------------------------------

export type ItemState = 'PARSED' | 'DISAMBIGUATING' | 'PORTIONING' | 'RESOLVED' | 'NO_MATCH';

export type QuestionType = 'disambiguation' | 'portion' | 'no_match_retry' | 'completion' | 'companion';

export interface ParsedItem {
  id: string;
  rawText: string;
  inferredAmount?: {
    value: number;
    unit: string;
  };
  state: ItemState;
  fineliCandidates?: FineliFood[];
  selectedFood?: FineliFood;
  portionGrams?: number;
  portionUnitCode?: string;
  portionUnitLabel?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuestionOption {
  key: string;
  label: string;
  sublabel?: string;
  value: unknown;
}

export interface PendingQuestion {
  id: string;
  itemId: string;
  type: QuestionType;
  templateKey: string;
  templateParams: Record<string, string | number>;
  options?: QuestionOption[];
  retryCount: number;
  askedAt: number;
}

export interface ConversationState {
  sessionId: string;
  mealId: string;
  items: ParsedItem[];
  unresolvedQueue: string[];     // ParsedItem IDs
  activeItemId: string | null;
  pendingQuestion: PendingQuestion | null;
  companionChecks: string[];
  isComplete: boolean;
  language: 'fi' | 'en';
}

export interface ResolvedItem {
  parsedItemId: string;
  fineliFoodId: number;
  fineliNameFi: string;
  fineliNameEn: string | null;
  portionGrams: number;
  portionUnitCode: string | null;
  portionUnitLabel: string | null;
  portionAmount: number;
  nutrientsPer100g: Record<string, number>;
  computedNutrients: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Portion conversion
// ---------------------------------------------------------------------------

export interface PortionConversionResult {
  grams: number;
  unitCode: string;
  unitLabel: string;
  method: 'fineli_unit' | 'direct_grams' | 'volume_density' | 'user_provided';
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------

export type IntentType = 'add_items' | 'answer' | 'correction' | 'removal' | 'done' | 'unclear';

export interface ParsedIntent {
  type: IntentType;
  data: unknown;
}

export interface ParsedMealItem {
  text: string;
  amount?: number;
  unit?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportInput {
  days: {
    date: string;
    meals: {
      mealType: MealType;
      customName?: string;
      items: {
        foodName: string;
        amount: number;
        unit: string;
        grams: number;
        nutrients: Record<string, number | null>;
      }[];
    }[];
  }[];
}

export interface ExportOptions {
  templateVersion?: string;
}

// ---------------------------------------------------------------------------
// Chat UI types (shared with API responses)
// ---------------------------------------------------------------------------

export interface ChatMessageOption {
  type: 'disambiguation' | 'portion' | 'confirmation';
  items: {
    key: string;
    label: string;
    sublabel?: string;
  }[];
  selected?: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  state?: 'sending' | 'sent' | 'error';
  options?: ChatMessageOption[];
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
