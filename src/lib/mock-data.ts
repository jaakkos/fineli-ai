import type {
  MealItemWithNutrients,
  MealWithItems,
  DiaryDayFull,
  ChatMessageData,
} from '@/types';

// ---------------------------------------------------------------------------
// Mock meal items with realistic Finnish foods and nutrient data
// ---------------------------------------------------------------------------

function makeMealItem(
  id: string,
  mealId: string,
  foodName: string,
  portionGrams: number,
  portionLabel: string,
  portionUnitCode: string | null,
  nutrients: Record<string, number>,
  sortOrder: number,
): MealItemWithNutrients {
  const computed: Record<string, number> = {};
  for (const [k, v] of Object.entries(nutrients)) {
    computed[k] = (v * portionGrams) / 100;
  }
  return {
    id,
    mealId,
    userText: null,
    fineliFoodId: Math.floor(Math.random() * 10000),
    fineliNameFi: foodName,
    fineliNameEn: null,
    portionAmount: 1,
    portionUnitCode,
    portionUnitLabel: portionLabel,
    portionGrams,
    nutrientsPer100g: nutrients,
    sortOrder,
    createdAt: '2026-02-15T08:00:00Z',
    updatedAt: '2026-02-15T08:00:00Z',
    deletedAt: null,
    computedNutrients: computed,
  };
}

function sumNutrients(items: MealItemWithNutrients[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    for (const [k, v] of Object.entries(item.computedNutrients)) {
      totals[k] = (totals[k] ?? 0) + v;
    }
  }
  return totals;
}

// -- Breakfast items --

const breakfastItems: MealItemWithNutrients[] = [
  makeMealItem('mi-1', 'meal-1', 'Kaurapuuro, vedellä', 300, '1 annos', 'ANNOS', {
    ENERC: 192, FAT: 2.5, PROT: 4.5, CHOAVL: 21, FIBC: 2.8, SUGAR: 0.3,
    FASAT: 0.5, FAMCIS: 0.8, FAPU: 0.9, NA: 2, K: 130, CA: 10, FE: 1.5,
    VITC: 0, VITD: 0, VITB12: 0,
  }, 0),
  makeMealItem('mi-2', 'meal-1', 'Maito, kevytmaito 1%', 200, '2 dl', 'DL', {
    ENERC: 155, FAT: 1, PROT: 3.4, CHOAVL: 4.8, FIBC: 0, SUGAR: 4.8,
    FASAT: 0.6, FAMCIS: 0.3, FAPU: 0, NA: 44, K: 160, CA: 120, FE: 0,
    VITC: 1, VITD: 1, VITB12: 0.4,
  }, 1),
  makeMealItem('mi-3', 'meal-1', 'Banaani, kuorittu', 125, 'keskikokoinen', 'KPL_M', {
    ENERC: 393, FAT: 0.3, PROT: 1.1, CHOAVL: 20, FIBC: 1.6, SUGAR: 17,
    FASAT: 0.1, FAMCIS: 0, FAPU: 0.1, NA: 1, K: 360, CA: 5, FE: 0.3,
    VITC: 9, VITD: 0, VITB12: 0,
  }, 2),
];

// -- Lunch items --

const lunchItems: MealItemWithNutrients[] = [
  makeMealItem('mi-4', 'meal-2', 'Broilerin rintafilee, paistettu', 150, '1 annos', 'ANNOS', {
    ENERC: 695, FAT: 3.5, PROT: 28, CHOAVL: 0, FIBC: 0, SUGAR: 0,
    FASAT: 1, FAMCIS: 1.3, FAPU: 0.8, NA: 55, K: 320, CA: 12, FE: 0.5,
    VITC: 0, VITD: 0.4, VITB12: 0.3,
  }, 0),
  makeMealItem('mi-5', 'meal-2', 'Riisi, keitetty', 200, '1 annos', 'ANNOS', {
    ENERC: 544, FAT: 0.3, PROT: 2.6, CHOAVL: 28, FIBC: 0.3, SUGAR: 0,
    FASAT: 0.1, FAMCIS: 0.1, FAPU: 0.1, NA: 1, K: 30, CA: 5, FE: 0.2,
    VITC: 0, VITD: 0, VITB12: 0,
  }, 1),
  makeMealItem('mi-6', 'meal-2', 'Salaatti, sekasalaatti', 100, '1 annos', 'ANNOS', {
    ENERC: 59, FAT: 0.2, PROT: 1.3, CHOAVL: 2, FIBC: 1.5, SUGAR: 1.8,
    FASAT: 0, FAMCIS: 0, FAPU: 0.1, NA: 10, K: 250, CA: 30, FE: 0.8,
    VITC: 15, VITD: 0, VITB12: 0,
  }, 2),
  makeMealItem('mi-7', 'meal-2', 'Rypsiöljy', 10, '1 rkl', 'RKL', {
    ENERC: 3700, FAT: 100, PROT: 0, CHOAVL: 0, FIBC: 0, SUGAR: 0,
    FASAT: 6.5, FAMCIS: 58, FAPU: 30, NA: 0, K: 0, CA: 0, FE: 0,
    VITC: 0, VITD: 0, VITB12: 0,
  }, 3),
];

// -- Snack items --

const snackItems: MealItemWithNutrients[] = [
  makeMealItem('mi-8', 'meal-4', 'Ruisleipä', 40, '1 viipale', 'KPL', {
    ENERC: 874, FAT: 1.2, PROT: 6.5, CHOAVL: 38, FIBC: 12, SUGAR: 2,
    FASAT: 0.2, FAMCIS: 0.2, FAPU: 0.5, NA: 500, K: 300, CA: 20, FE: 2.5,
    VITC: 0, VITD: 0, VITB12: 0,
  }, 0),
  makeMealItem('mi-9', 'meal-4', 'Juusto, edam 24%', 20, '1 viipale', 'KPL', {
    ENERC: 1280, FAT: 24, PROT: 27, CHOAVL: 0, FIBC: 0, SUGAR: 0,
    FASAT: 15.5, FAMCIS: 7, FAPU: 0.6, NA: 700, K: 80, CA: 770, FE: 0.3,
    VITC: 0, VITD: 0.3, VITB12: 1.5,
  }, 1),
];

// ---------------------------------------------------------------------------
// Mock meals
// ---------------------------------------------------------------------------

const breakfastTotals = sumNutrients(breakfastItems);
const lunchTotals = sumNutrients(lunchItems);
const snackTotals = sumNutrients(snackItems);

const mockBreakfast: MealWithItems = {
  id: 'meal-1',
  diaryDayId: 'day-1',
  mealType: 'breakfast',
  customName: null,
  sortOrder: 0,
  version: 1,
  createdAt: '2026-02-15T07:00:00Z',
  updatedAt: '2026-02-15T08:30:00Z',
  deletedAt: null,
  items: breakfastItems,
  totals: breakfastTotals,
};

const mockLunch: MealWithItems = {
  id: 'meal-2',
  diaryDayId: 'day-1',
  mealType: 'lunch',
  customName: null,
  sortOrder: 1,
  version: 1,
  createdAt: '2026-02-15T11:30:00Z',
  updatedAt: '2026-02-15T12:00:00Z',
  deletedAt: null,
  items: lunchItems,
  totals: lunchTotals,
};

const mockDinner: MealWithItems = {
  id: 'meal-3',
  diaryDayId: 'day-1',
  mealType: 'dinner',
  customName: null,
  sortOrder: 2,
  version: 1,
  createdAt: '2026-02-15T17:00:00Z',
  updatedAt: '2026-02-15T17:00:00Z',
  deletedAt: null,
  items: [],
  totals: {},
};

const mockSnack: MealWithItems = {
  id: 'meal-4',
  diaryDayId: 'day-1',
  mealType: 'snack',
  customName: null,
  sortOrder: 3,
  version: 1,
  createdAt: '2026-02-15T14:00:00Z',
  updatedAt: '2026-02-15T14:30:00Z',
  deletedAt: null,
  items: snackItems,
  totals: snackTotals,
};

// ---------------------------------------------------------------------------
// Mock diary day
// ---------------------------------------------------------------------------

const allMeals = [mockBreakfast, mockLunch, mockDinner, mockSnack];

const dayTotals: Record<string, number> = {};
for (const meal of allMeals) {
  for (const [k, v] of Object.entries(meal.totals)) {
    dayTotals[k] = (dayTotals[k] ?? 0) + v;
  }
}

export const mockDiaryDay: DiaryDayFull = {
  id: 'day-1',
  userId: 'user-1',
  date: '2026-02-15',
  createdAt: '2026-02-15T06:00:00Z',
  updatedAt: '2026-02-15T14:30:00Z',
  deletedAt: null,
  meals: allMeals,
  dayTotals,
};

// ---------------------------------------------------------------------------
// Mock chat messages for breakfast
// ---------------------------------------------------------------------------

export const mockBreakfastMessages: ChatMessageData[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content: 'Hyvää huomenta! Kerro mitä söit aamiaiseksi.',
    timestamp: '2026-02-15T07:00:00Z',
  },
  {
    id: 'msg-2',
    role: 'user',
    content: 'Puuroa ja banaanin',
    timestamp: '2026-02-15T07:01:00Z',
    state: 'sent',
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content: 'Kumpi puuro sopii parhaiten?',
    timestamp: '2026-02-15T07:01:05Z',
    options: [
      {
        type: 'disambiguation',
        items: [
          { key: '1', label: 'Kaurapuuro, vedellä', sublabel: '192 kJ/100g' },
          { key: '2', label: 'Kaurapuuro, maidolla', sublabel: '310 kJ/100g' },
          { key: '3', label: 'Riisipuuro, maidolla', sublabel: '355 kJ/100g' },
        ],
        selected: '1',
      },
    ],
  },
  {
    id: 'msg-4',
    role: 'user',
    content: '1',
    timestamp: '2026-02-15T07:01:10Z',
    state: 'sent',
  },
  {
    id: 'msg-5',
    role: 'assistant',
    content: 'Kuinka paljon kaurapuuroa söit?',
    timestamp: '2026-02-15T07:01:15Z',
    options: [
      {
        type: 'portion',
        items: [
          { key: 'small', label: 'Pieni annos', sublabel: '(200g)' },
          { key: 'medium', label: 'Keskikokoinen annos', sublabel: '(300g)' },
          { key: 'large', label: 'Iso annos', sublabel: '(400g)' },
        ],
        selected: 'medium',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mock chat messages for lunch (with active question, no selection yet)
// ---------------------------------------------------------------------------

export const mockLunchMessages: ChatMessageData[] = [
  {
    id: 'msg-l1',
    role: 'assistant',
    content: 'Kerro mitä söit lounaaksi.',
    timestamp: '2026-02-15T11:30:00Z',
  },
  {
    id: 'msg-l2',
    role: 'user',
    content: 'Kanaa, riisiä, salaattia ja vähän öljyä',
    timestamp: '2026-02-15T11:31:00Z',
    state: 'sent',
  },
  {
    id: 'msg-l3',
    role: 'assistant',
    content: 'Lisäsin kaikki! Haluatko lisätä jotain muuta lounaalle?',
    timestamp: '2026-02-15T11:31:10Z',
    options: [
      {
        type: 'confirmation',
        items: [
          { key: 'done', label: 'Ei, tämä riittää' },
          { key: 'more', label: 'Kyllä, lisää ruokia' },
        ],
      },
    ],
  },
];

// Default empty messages for meals without conversation
export const mockEmptyMessages: ChatMessageData[] = [
  {
    id: 'msg-empty',
    role: 'assistant',
    content: 'Kerro mitä söit tällä aterialla.',
    timestamp: '2026-02-15T17:00:00Z',
  },
];
