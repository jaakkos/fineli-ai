import {
  FineliFood,
  FineliUnit,
  FineliComponent,
  COMPONENT_ORDER,
} from '@/types';
import type { MemoryCache } from '@/lib/utils/cache';
import type {
  FineliApiFoodSearchItem,
  FineliApiFoodDetail,
  FineliApiComponent,
  FineliApiUnit,
} from './types';
import { normalizeQuery, FOOD_ALIASES } from './search';

interface FineliClientConfig {
  baseUrl: string;
  defaultLang: 'fi' | 'en' | 'sv';
  cache: MemoryCache;
}

/** Resolved names for a food (used when detail endpoint doesn't return name) */
interface CachedFoodName {
  nameFi: string;
  nameEn: string | null;
  nameSv: string | null;
}

function mapApiUnitToUnit(api: FineliApiUnit): FineliUnit {
  return {
    code: api.code,
    labelFi: api.description.fi,
    labelEn: api.description.en,
    massGrams: api.mass,
  };
}

function mapSearchItemToFood(item: FineliApiFoodSearchItem): FineliFood {
  const nutrients: Record<string, number> = {
    ENERC: item.energy,
    FAT: item.fat,
    CHOAVL: item.carbohydrate,
    PROT: item.protein,
    FIBC: item.fiber ?? 0,
  };

  return {
    id: item.id,
    nameFi: item.name.fi,
    nameEn: item.name.en || null,
    nameSv: item.name.sv || null,
    type: item.type.code,
    preparationMethods: (item.preparationMethod ?? []).map((pm) => pm.code),
    units: (item.units ?? []).map(mapApiUnitToUnit),
    nutrients,
    energyKj: item.energy,
    energyKcal: item.energyKcal,
    fat: item.fat,
    protein: item.protein,
    carbohydrate: item.carbohydrate,
  };
}

function mapDataToNutrients(data: number[]): Record<string, number> {
  const nutrients: Record<string, number> = {};
  for (let i = 0; i < Math.min(data.length, COMPONENT_ORDER.length); i++) {
    const code = COMPONENT_ORDER[i];
    const value = data[i];
    if (code != null && typeof value === 'number') {
      nutrients[code] = value;
    }
  }
  return nutrients;
}

function mapApiComponentToComponent(api: FineliApiComponent): FineliComponent {
  return {
    id: api.id,
    code: api.code,
    nameFi: api.name.fi,
    nameEn: api.name.en,
    unit: api.unit,
  };
}

export class FineliClient {
  private baseUrl: string;
  private defaultLang: 'fi' | 'en' | 'sv';
  private cache: MemoryCache;

  constructor(config: FineliClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultLang = config.defaultLang;
    this.cache = config.cache;
  }

  async searchFoods(query: string, lang?: string): Promise<FineliFood[]> {
    const langKey = lang ?? this.defaultLang;
    const normalizedQuery = normalizeQuery(query);
    // Apply food aliases before search (e.g. "kevytmaito" → "maito, kevyt")
    const searchQuery = FOOD_ALIASES[normalizedQuery] ?? normalizedQuery;
    const cacheKey = `fineli:search:${searchQuery}:${langKey}`;

    const cached = this.cache.get<FineliFood[]>(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}/foods?q=${encodeURIComponent(searchQuery)}&lang=${langKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const stale = this.cache.getStale<FineliFood[]>(cacheKey);
      if (stale) return stale;
      throw new Error(`Fineli search failed: ${res.status} ${res.statusText}`);
    }

    const raw: FineliApiFoodSearchItem[] = await res.json();
    const foods = raw.map(mapSearchItemToFood);

    // Cache name mappings for getFood resolution (7 days)
    const nameTtlMs = 7 * 24 * 60 * 60 * 1000;
    for (const food of foods) {
      this.cache.set<CachedFoodName>(
        `fineli:name:${food.id}`,
        {
          nameFi: food.nameFi,
          nameEn: food.nameEn,
          nameSv: food.nameSv,
        },
        nameTtlMs
      );
    }

    this.cache.set(cacheKey, foods, 60 * 60 * 1000); // 1 hour
    return foods;
  }

  async getFood(
    id: number,
    nameFromSearch?: {
      nameFi: string;
      nameEn?: string | null;
      nameSv?: string | null;
    }
  ): Promise<FineliFood> {
    const cacheKey = `fineli:food:${id}`;
    const cached = this.cache.get<FineliFood>(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}/foods/${id}`;
    const res = await fetch(url);
    if (!res.ok) {
      const stale = this.cache.getStale<FineliFood>(cacheKey);
      if (stale) return stale;
      throw new Error(`Fineli getFood failed: ${res.status} ${res.statusText}`);
    }

    const detail: FineliApiFoodDetail = await res.json();

    // Resolve name: prefer explicit param, then cached from search
    let nameFi: string;
    let nameEn: string | null;
    let nameSv: string | null;

    if (nameFromSearch?.nameFi) {
      nameFi = nameFromSearch.nameFi;
      nameEn = nameFromSearch.nameEn ?? null;
      nameSv = nameFromSearch.nameSv ?? null;
    } else {
      const cachedName = this.cache.get<CachedFoodName>(`fineli:name:${id}`);
      if (cachedName) {
        nameFi = cachedName.nameFi;
        nameEn = cachedName.nameEn;
        nameSv = cachedName.nameSv;
      } else {
        nameFi = `Tuote ${id}`;
        nameEn = null;
        nameSv = null;
      }
    }

    const nutrients = mapDataToNutrients(detail.data);
    const food: FineliFood = {
      id,
      nameFi,
      nameEn,
      nameSv,
      type: 'FOOD',
      preparationMethods: [],
      units: (detail.units ?? []).map(mapApiUnitToUnit),
      nutrients,
      energyKj: nutrients.ENERC ?? 0,
      energyKcal: (nutrients.ENERC ?? 0) / 4.184, // kJ to kcal approx
      fat: nutrients.FAT ?? 0,
      protein: nutrients.PROT ?? 0,
      carbohydrate: nutrients.CHOAVL ?? 0,
    };

    this.cache.set(cacheKey, food, 7 * 24 * 60 * 60 * 1000); // 7 days
    return food;
  }

  async getComponents(): Promise<FineliComponent[]> {
    const cacheKey = 'fineli:components';
    const cached = this.cache.get<FineliComponent[]>(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}/components?lang=fi`;
    const res = await fetch(url);
    if (!res.ok) {
      const stale = this.cache.getStale<FineliComponent[]>(cacheKey);
      if (stale) return stale;
      throw new Error(`Fineli getComponents failed: ${res.status} ${res.statusText}`);
    }

    const raw: FineliApiComponent[] = await res.json();
    const components = raw.map(mapApiComponentToComponent);
    this.cache.set(cacheKey, components, 24 * 60 * 60 * 1000); // 24 hours
    return components;
  }
}
