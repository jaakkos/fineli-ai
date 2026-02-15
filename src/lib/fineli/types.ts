// Raw Fineli API response types — match the actual Fineli REST API responses

/** Localized string for fi/sv/en */
export interface LocalizedString {
  fi: string;
  sv: string;
  en: string;
}

// GET /api/v1/foods?q=banaani&lang=fi
export interface FineliApiFoodSearchItem {
  id: number;
  type: {
    code: 'FOOD' | 'DISH';
    description: { fi: string; sv: string; en: string };
  };
  name: {
    fi: string;
    sv: string;
    en: string;
    la: string;
  };
  preparationMethod: {
    code: string;
    description: { fi: string; sv: string; en: string };
  }[];
  ediblePortion: number;
  specialDiets: string[];
  units: FineliApiUnit[];
  ingredientClass: { code: string; description: LocalizedString };
  functionClass: { code: string; description: LocalizedString };
  salt: number;
  fat: number;
  protein: number;
  carbohydrate: number;
  alcohol: number;
  organicAcids: number;
  sugarAlcohol: number;
  saturatedFat: number;
  fiber: number;
  sugar: number;
  energyKcal: number;
  energy: number; // kJ
}

export interface FineliApiUnit {
  code: string;
  description: { fi: string; sv: string; en: string };
  abbreviation: { fi: string; sv: string; en: string };
  mass: number; // grams per unit
}

// GET /api/v1/foods/{id}
export interface FineliApiFoodDetail {
  unit: string;
  amount: number;
  units: FineliApiUnit[];
  data: number[]; // 55 values in component order (per 100g)
  functionClass: { code: string; description: LocalizedString };
  specialDiets: string[];
  ingredientClass: { code: string; description: LocalizedString };
  // Note: name is NOT in the detail response
}

// GET /api/v1/components
export interface FineliApiComponent {
  id: number;
  code: string;
  name: { fi: string; en: string; sv: string };
  unit: string;
}
