# 04 — Fineli Integration

## Fineli Open Data API

Base URL: `https://fineli.fi/fineli/api/v1`
License: Creative Commons 4.0 CC-BY (attribution to THL/Fineli required)
Swagger: `https://fineli.fi/fineli/v2/api-docs`

### Endpoints

| Endpoint | Method | Params | Returns |
|----------|--------|--------|---------|
| `/foods` | GET | `q` (search), `lang` (fi/en/sv) | Array of foods with units and summary nutrients |
| `/foods/{id}` | GET | `lang` (optional) | Single food with full nutrient `data[]` and `units[]` |
| `/components` | GET | `q` (optional), `lang` (fi/en/sv) | Array of 55 nutrient components |

### Food Search Response Structure

```typescript
// GET /api/v1/foods?q=banaani&lang=fi
interface FineliApiFoodSearchItem {
  id: number;
  type: {
    code: 'FOOD' | 'DISH';
    description: { fi: string; sv: string; en: string };
  };
  name: {
    fi: string;
    sv: string;
    en: string;
    la: string; // Latin name
  };
  preparationMethod: {
    code: string; // 'RAW', 'FRIE', 'BOIL', etc.
    description: { fi: string; sv: string; en: string };
  }[];
  ediblePortion: number; // usually 100
  specialDiets: string[]; // 'GLUTFREE', 'LACSFREE', 'VEGAN', etc.
  units: FineliApiUnit[];
  ingredientClass: { code: string; description: LocalizedString };
  functionClass: { code: string; description: LocalizedString };
  // Summary nutrient values (per 100g)
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

interface FineliApiUnit {
  code: string;        // 'KPL_S', 'KPL_M', 'KPL_L', 'DL', 'G', 'PORTS', 'PORTM', 'PORTL', etc.
  description: { fi: string; sv: string; en: string };
  abbreviation: { fi: string; sv: string; en: string };
  mass: number;        // Weight in grams for 1 unit
}
```

### Food Detail Response Structure

```typescript
// GET /api/v1/foods/11049
interface FineliApiFoodDetail {
  unit: string;    // 'G'
  amount: number;  // 100
  units: FineliApiUnit[];
  data: number[];  // 55 values in component order (per 100g)
  functionClass: { code: string; description: LocalizedString };
  specialDiets: string[];
  ingredientClass: { code: string; description: LocalizedString };
  // Note: name is NOT in the detail response — get it from search
}
```

### Component Order (data[] index mapping)

The `data[]` array in food details maps 1:1 to the components list. Here are all 55 in order:

| Index | Code | Name (Finnish) | Unit |
|-------|------|----------------|------|
| 0 | ENERC | energia, laskennallinen | kJ |
| 1 | FAT | rasva | g |
| 2 | CHOAVL | hiilihydraatti imeytyvä | g |
| 3 | PROT | proteiini | g |
| 4 | ALC | alkoholi | g |
| 5 | OA | orgaaniset hapot | g |
| 6 | SUGOH | sokerialkoholi | g |
| 7 | SUGAR | sokerit | g |
| 8 | FRUS | fruktoosi | g |
| 9 | GALS | galaktoosi | g |
| 10 | GLUS | glukoosi | g |
| 11 | LACS | laktoosi | g |
| 12 | MALS | maltoosi | g |
| 13 | SUCS | sakkaroosi | g |
| 14 | STARCH | tärkkelys | g |
| 15 | FIBC | kuitu, kokonais- | g |
| 16 | FIBINS | kuitu veteen liukenematon | g |
| 17 | PSACNCS | polysakkaridi, vesiliukoinen ei-selluloosa | g |
| 18 | FAFRE | rasvahapot yhteensä | g |
| 19 | FAPU | rasvahapot monityydyttymättömät | g |
| 20 | FAMCIS | rasvahapot yksittäistyydyttymättömät cis | g |
| 21 | FASAT | rasvahapot tyydyttyneet | g |
| 22 | FATRN | rasvahapot trans | g |
| 23 | FAPUN3 | rasvahapot n-3 monityydyttymättömät | g |
| 24 | FAPUN6 | rasvahapot n-6 monityydyttymättömät | g |
| 25 | F18D2CN6 | linolihappo 18:2 n-6 | mg |
| 26 | F18D3N3 | alfalinoleenihappo 18:3 n-3 | mg |
| 27 | F20D5N3 | EPA 20:5 n-3 | mg |
| 28 | F22D6N3 | DHA 22:6 n-3 | mg |
| 29 | CHOLE | kolesteroli | mg |
| 30 | STERT | sterolit | mg |
| 31 | CA | kalsium | mg |
| 32 | FE | rauta | mg |
| 33 | ID | jodidi (jodi) | µg |
| 34 | K | kalium | mg |
| 35 | MG | magnesium | mg |
| 36 | NA | natrium | mg |
| 37 | NACL | suola | mg |
| 38 | P | fosfori | mg |
| 39 | SE | seleeni | µg |
| 40 | ZN | sinkki | mg |
| 41 | TRP | tryptofaani | mg |
| 42 | FOL | folaatti, kokonais- | µg |
| 43 | NIAEQ | niasiiniekvivalentti NE | mg |
| 44 | NIA | niasiini | mg |
| 45 | VITPYRID | pyridoksiini (B6) | mg |
| 46 | RIBF | riboflaviini (B2) | mg |
| 47 | THIA | tiamiini (B1) | mg |
| 48 | VITA | A-vitamiini RAE | µg |
| 49 | CAROTENS | karotenoidit | µg |
| 50 | VITB12 | B12-vitamiini | µg |
| 51 | VITC | C-vitamiini | mg |
| 52 | VITD | D-vitamiini | µg |
| 53 | VITE | E-vitamiini alfatokoferoli | mg |
| 54 | VITK | K-vitamiini | µg |

### Component IDs (for reference)

```typescript
const COMPONENT_IDS: Record<string, number> = {
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

const COMPONENT_ORDER: string[] = [
  'ENERC', 'FAT', 'CHOAVL', 'PROT', 'ALC', 'OA', 'SUGOH', 'SUGAR',
  'FRUS', 'GALS', 'GLUS', 'LACS', 'MALS', 'SUCS', 'STARCH', 'FIBC',
  'FIBINS', 'PSACNCS', 'FAFRE', 'FAPU', 'FAMCIS', 'FASAT', 'FATRN',
  'FAPUN3', 'FAPUN6', 'F18D2CN6', 'F18D3N3', 'F20D5N3', 'F22D6N3',
  'CHOLE', 'STERT', 'CA', 'FE', 'ID', 'K', 'MG', 'NA', 'NACL',
  'P', 'SE', 'ZN', 'TRP', 'FOL', 'NIAEQ', 'NIA', 'VITPYRID',
  'RIBF', 'THIA', 'VITA', 'CAROTENS', 'VITB12', 'VITC', 'VITD',
  'VITE', 'VITK',
];
```

---

## FineliClient Service

```typescript
interface FineliClientConfig {
  baseUrl: string;  // 'https://fineli.fi/fineli/api/v1'
  defaultLang: 'fi' | 'en' | 'sv';
  cache: CacheStore;
}

class FineliClient {
  constructor(config: FineliClientConfig) {}

  /** Search foods by name. Returns ranked results. */
  async searchFoods(query: string, lang?: string): Promise<FineliFood[]>

  /** Get full food details with all 55 nutrients. */
  async getFood(id: number): Promise<FineliFood>

  /** Get component list. Cached for 24h. */
  async getComponents(): Promise<FineliComponent[]>
}
```

### Normalized Types (our internal representation)

```typescript
interface FineliFood {
  id: number;
  nameFi: string;
  nameEn: string | null;
  nameSv: string | null;
  type: 'FOOD' | 'DISH';
  preparationMethods: string[];
  units: FineliUnit[];
  /** Nutrients per 100g, keyed by component code */
  nutrients: Record<string, number>;
  /** Summary for quick display */
  energyKj: number;
  energyKcal: number;
  fat: number;
  protein: number;
  carbohydrate: number;
}

interface FineliUnit {
  code: string;
  labelFi: string;
  labelEn: string;
  massGrams: number;
}

interface FineliComponent {
  id: number;
  code: string;
  nameFi: string;
  nameEn: string;
  unit: string; // 'g', 'mg', 'µg', 'kJ'
}
```

---

## Food Search & Ranking

### Search Algorithm

```
1. Query Fineli API: /foods?q={normalizedQuery}&lang=fi
2. Filter out irrelevant types (keep FOOD and DISH)
3. Score each result:
   a. Exact match (name === query): +100
   b. Starts with query: +50
   c. Contains query: +20
   d. Type FOOD over DISH (prefer raw ingredients): +10
   e. User's recent selections (if available): +30
4. Sort by score descending
5. Return top 5
```

### Search Normalization

```typescript
function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[,.]$/g, '')       // Remove trailing punctuation
    .replace(/\s+/g, ' ');       // Collapse whitespace
}
```

### Known Aliases

Common user terms mapped to Fineli search terms:

```typescript
const FOOD_ALIASES: Record<string, string> = {
  'maito': 'maito',
  'kevytmaito': 'maito, kevyt',
  'rasvaton maito': 'maito, rasvaton',
  'täysmaito': 'maito, täysi',
  'puuro': 'kaurapuuro',
  'omena': 'omena',
  'kahvi': 'kahvi',
  'leipä': 'leipä',
  'voi': 'voi',
  'juusto': 'juusto',
  // Add more as discovered from usage
};
```

---

## Portion Conversion

### Strategy

Fineli's API already provides `units[]` with `mass` (grams per unit) for each food. This is the primary conversion source.

```typescript
interface PortionConversionResult {
  grams: number;
  unitCode: string;
  unitLabel: string;
  method: 'fineli_unit' | 'direct_grams' | 'volume_density' | 'user_provided';
}

class PortionConverter {
  /**
   * Convert a user-provided portion to grams.
   * @param amount - numeric value (e.g., 2)
   * @param unitInput - what user said (e.g., "dl", "medium", "kpl")
   * @param fineliUnits - available units from Fineli for this food
   */
  convert(
    amount: number,
    unitInput: string,
    fineliUnits: FineliUnit[]
  ): PortionConversionResult | null
}
```

### Conversion Priority

1. **Direct grams**: user says "120g" → `{ grams: 120, method: 'direct_grams' }`
2. **Fineli unit match**: user says "medium" → find `KPL_M` in units → `{ grams: units.KPL_M.mass * amount }`
3. **Volume with density**: user says "2 dl" → find `DL` in units → `{ grams: units.DL.mass * amount }`
4. **Generic volume** (no DL unit): assume 1 ml = 1 g for liquids
5. **Fail**: return null → ask user for grams

### Unit Input Normalization

```typescript
const UNIT_ALIASES: Record<string, string> = {
  // Direct grams
  'g': 'G', 'grammaa': 'G', 'gram': 'G',
  'kg': 'KG',
  // Volume
  'dl': 'DL', 'desi': 'DL', 'desilitra': 'DL',
  'ml': 'ML', 'millilitra': 'ML',
  'l': 'L', 'litra': 'L',
  // Pieces
  'kpl': 'KPL_M', 'kappaletta': 'KPL_M', 'piece': 'KPL_M', 'pcs': 'KPL_M',
  // Sizes (map to Fineli unit codes)
  'pieni': 'KPL_S', 'small': 'KPL_S',
  'keskikokoinen': 'KPL_M', 'medium': 'KPL_M',
  'iso': 'KPL_L', 'large': 'KPL_L', 'suuri': 'KPL_L',
  // Portions
  'annos': 'PORTM', 'portion': 'PORTM',
  'pieni annos': 'PORTS', 'small portion': 'PORTS',
  'iso annos': 'PORTL', 'large portion': 'PORTL',
  // Household
  'rkl': 'RKL', 'ruokalusikka': 'RKL', 'tbsp': 'RKL',
  'tl': 'TL', 'teelusikka': 'TL', 'tsp': 'TL',
  'kuppi': 'CUP', 'cup': 'CUP',
  'lasi': 'GLASS', 'glass': 'GLASS',
  'viipale': 'SLICE', 'slice': 'SLICE',
};
```

### Volume → Grams (when no Fineli DL unit)

For liquids without a DL unit in Fineli, use density table:

```typescript
const DENSITY_TABLE: Record<string, number> = {
  // g per ml
  'default_liquid': 1.0,
  'milk': 1.03,
  'cream': 1.01,
  'oil': 0.92,
  'honey': 1.42,
  'flour': 0.53,   // g per ml (loose)
  'sugar': 0.85,
  'oats': 0.40,    // rolled oats, loose
  'rice_raw': 0.85,
};
```

---

## Caching Strategy

| Resource | Cache Key | TTL | Stale Serve |
|----------|-----------|-----|-------------|
| Food search | `fineli:search:{md5(q+lang)}` | 1 hour | Yes (on 5xx) |
| Food detail | `fineli:food:{id}` | 7 days | Yes (on 5xx) |
| Components | `fineli:components` | 24 hours | Yes (on 5xx) |

### Implementation (MVP: In-Memory Map + TTL)

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  staleData?: T; // Previous value, served on error
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null { /* return if not expired */ }
  getStale<T>(key: string): T | null { /* return even if expired */ }
  set<T>(key: string, data: T, ttlMs: number): void { /* store with expiry */ }
}
```

**Note:** In-memory cache is lost on server restart. This is acceptable for MVP. Future: use Redis or Vercel KV.

### Rate Limiting

Fineli's API does not document rate limits, but be a good citizen:
- Max 10 concurrent requests to Fineli
- Max 60 requests per minute
- Queue excess requests

```typescript
class RateLimiter {
  private queue: (() => void)[] = [];
  private active = 0;
  private windowRequests = 0;

  async acquire(): Promise<void> { /* wait for slot */ }
  release(): void { /* free slot */ }
}
```

---

## Example: Full Resolution Flow

```
User text: "banaani"
  ↓
1. FineliClient.searchFoods("banaani")
   → Returns 15 results (from Fineli API, cached 1h)
   
2. FoodSearchService.rank(results, "banaani")
   → Top 5:
     1. Banaani, kuorittu (ID: 11049, FOOD, exact prefix)
     2. Banaani, punnittu kuorineen (ID: 28934, FOOD)
     3. Banaani, friteerattu (ID: 4019, DISH)
     4. Banaanilastu, kuivattu (ID: 11505, FOOD)
     5. Banaanismoothie (ID: 33xxx, DISH)

3. User selects #1 (Banaani, kuorittu)
   ↓
4. FineliClient.getFood(11049)
   → units: [KPL_S=100g, KPL_M=125g, KPL_L=150g, G=1g]
   → data: [366, 0.4, 18.3, 1.2, ...] (55 values per 100g)

5. Ask portion: "pieni / keskikokoinen / iso vai grammoina?"
   User: "keskikokoinen"
   ↓
6. PortionConverter.convert(1, "keskikokoinen", units)
   → { grams: 125, unitCode: "KPL_M", method: "fineli_unit" }

7. Store: nutrients_per_100g = { ENERC: 366, FAT: 0.4, ... }
8. Compute: ENERC = 366 * 125 / 100 = 457.5 kJ
```
