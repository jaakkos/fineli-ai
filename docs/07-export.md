# 07 — Export Specification

## Overview

The export generates an `.xlsx` file matching the Fineli diary export format. The file contains one sheet with food item rows, meal subtotal rows, and day total rows, with columns for metadata and all 55 nutrients.

---

## Sheet Structure

| Property | Value |
|----------|-------|
| **Sheet name** | `Ruokapäiväkirja` |
| **Header row** | Row 1 (bold, gray fill, frozen) |
| **Data rows** | Row 2+ |
| **Column count** | 62 (6 metadata + 55 nutrients + 1 derived kcal) |

---

## Column Definitions

### Metadata Columns (A–F)

| Col | Key | Header | Width | Format |
|-----|-----|--------|-------|--------|
| A | `date` | Päivä | 12 | `dd.mm.yyyy` |
| B | `mealType` | Ateria | 14 | Text |
| C | `foodName` | Elintarvike | 32 | Text |
| D | `amount` | Määrä | 8 | `0.0` |
| E | `unit` | Yksikkö | 12 | Text |
| F | `grams` | Paino (g) | 10 | `0.0` |

### Nutrient Columns (G–BI)

All 55 nutrients in Fineli component order. Each column:

| Col | Key | Header | Unit | Decimals |
|-----|-----|--------|------|----------|
| G | `ENERC` | Energia (kJ) | kJ | 0 |
| H | `FAT` | Rasva (g) | g | 1 |
| I | `CHOAVL` | Hiilihydraatti, imeytyvä (g) | g | 1 |
| J | `PROT` | Proteiini (g) | g | 1 |
| K | `ALC` | Alkoholi (g) | g | 1 |
| L | `OA` | Orgaaniset hapot (g) | g | 1 |
| M | `SUGOH` | Sokerialkoholi (g) | g | 1 |
| N | `SUGAR` | Sokerit (g) | g | 1 |
| O | `FRUS` | Fruktoosi (g) | g | 1 |
| P | `GALS` | Galaktoosi (g) | g | 1 |
| Q | `GLUS` | Glukoosi (g) | g | 1 |
| R | `LACS` | Laktoosi (g) | g | 1 |
| S | `MALS` | Maltoosi (g) | g | 1 |
| T | `SUCS` | Sakkaroosi (g) | g | 1 |
| U | `STARCH` | Tärkkelys (g) | g | 1 |
| V | `FIBC` | Kuitu (g) | g | 1 |
| W | `FIBINS` | Kuitu, liukenematon (g) | g | 1 |
| X | `PSACNCS` | Polysakkaridi (g) | g | 1 |
| Y | `FAFRE` | Rasvahapot yhteensä (g) | g | 1 |
| Z | `FAPU` | Monityydyttymättömät (g) | g | 1 |
| AA | `FAMCIS` | Kertatyydyttymättömät (g) | g | 1 |
| AB | `FASAT` | Tyydyttyneet (g) | g | 1 |
| AC | `FATRN` | Trans-rasvahapot (g) | g | 1 |
| AD | `FAPUN3` | n-3 rasvahapot (g) | g | 1 |
| AE | `FAPUN6` | n-6 rasvahapot (g) | g | 1 |
| AF | `F18D2CN6` | Linolihappo (mg) | mg | 1 |
| AG | `F18D3N3` | Alfalinoleenihappo (mg) | mg | 1 |
| AH | `F20D5N3` | EPA (mg) | mg | 1 |
| AI | `F22D6N3` | DHA (mg) | mg | 1 |
| AJ | `CHOLE` | Kolesteroli (mg) | mg | 1 |
| AK | `STERT` | Sterolit (mg) | mg | 1 |
| AL | `CA` | Kalsium (mg) | mg | 1 |
| AM | `FE` | Rauta (mg) | mg | 1 |
| AN | `ID` | Jodi (µg) | µg | 1 |
| AO | `K` | Kalium (mg) | mg | 1 |
| AP | `MG` | Magnesium (mg) | mg | 1 |
| AQ | `NA` | Natrium (mg) | mg | 1 |
| AR | `NACL` | Suola (mg) | mg | 1 |
| AS | `P` | Fosfori (mg) | mg | 1 |
| AT | `SE` | Seleeni (µg) | µg | 1 |
| AU | `ZN` | Sinkki (mg) | mg | 1 |
| AV | `TRP` | Tryptofaani (mg) | mg | 1 |
| AW | `FOL` | Folaatti (µg) | µg | 1 |
| AX | `NIAEQ` | Niasiiniekv. (mg) | mg | 1 |
| AY | `NIA` | Niasiini (mg) | mg | 1 |
| AZ | `VITPYRID` | B6-vitamiini (mg) | mg | 1 |
| BA | `RIBF` | B2-vitamiini (mg) | mg | 1 |
| BB | `THIA` | B1-vitamiini (mg) | mg | 1 |
| BC | `VITA` | A-vitamiini (µg) | µg | 1 |
| BD | `CAROTENS` | Karotenoidit (µg) | µg | 1 |
| BE | `VITB12` | B12-vitamiini (µg) | µg | 1 |
| BF | `VITC` | C-vitamiini (mg) | mg | 1 |
| BG | `VITD` | D-vitamiini (µg) | µg | 1 |
| BH | `VITE` | E-vitamiini (mg) | mg | 1 |
| BI | `VITK` | K-vitamiini (µg) | µg | 1 |

### Derived Column

| Col | Key | Header | Format | Formula |
|-----|-----|--------|--------|---------|
| BJ | `energyKcal` | Energia (kcal) | `0` | `ENERC / 4.184` |

---

## Row Types

### Food Item Row

A single food entry. All columns populated.

| Column | Value |
|--------|-------|
| Päivä | `14.02.2026` |
| Ateria | `Aamiainen` |
| Elintarvike | `Banaani, kuorittu` |
| Määrä | `1` |
| Yksikkö | `keskikokoinen kpl` |
| Paino (g) | `125.0` |
| Energia (kJ) | `457.5` |
| ... | computed nutrients |

### Meal Subtotal Row

Sum of all items in a meal. Appears after the last item of each meal.

| Column | Value |
|--------|-------|
| Päivä | (empty) |
| Ateria | (empty) |
| Elintarvike | `Yhteensä (Aamiainen)` |
| Määrä | (empty) |
| Yksikkö | (empty) |
| Paino (g) | sum of item grams |
| Nutrients | sum of item nutrients |

**Styling:** Bold text, light gray fill (`#F5F5F5`), thin top border.

### Day Total Row

Sum of all meals in a day. Appears after the last meal of each day.

| Column | Value |
|--------|-------|
| Päivä | `14.02.2026` |
| Ateria | (empty) |
| Elintarvike | `Päivän yhteensä` |
| Määrä | (empty) |
| Yksikkö | (empty) |
| Paino (g) | sum of all item grams |
| Nutrients | sum of all item nutrients |

**Styling:** Bold text, medium gray fill (`#E8E8E8`), double top border.

---

## Row Order

For a multi-day export:

```
[Header row]
[Day 1, Meal 1, Item 1]
[Day 1, Meal 1, Item 2]
[Day 1, Meal 1, Subtotal]       ← "Yhteensä (Aamiainen)"
[Day 1, Meal 2, Item 1]
[Day 1, Meal 2, Subtotal]       ← "Yhteensä (Lounas)"
[Day 1, Day Total]              ← "Päivän yhteensä"
[Day 2, Meal 1, Item 1]
[Day 2, Meal 1, Subtotal]
[Day 2, Day Total]
...
```

---

## Formatting Rules

### Header Row

- **Font:** Bold, 10pt
- **Fill:** Light gray (`#E0E0E0`)
- **Text wrap:** Enabled
- **Frozen:** Row 1 + Columns A–C (metadata always visible when scrolling)

### Number Formats

| Type | Excel Format | Example |
|------|-------------|---------|
| Date | Custom: `dd.mm.yyyy` | `14.02.2026` |
| Grams (g) | `0.0` | `125.0` |
| Milligrams (mg) | `0.0` | `31.3` |
| Micrograms (µg) | `0.0` | `12.5` |
| Energy kJ | `0` | `458` |
| Energy kcal | `0` | `109` |
| Null/missing | Empty cell | (blank) |

### Null Value Handling

- If a nutrient value is `null` or `undefined` in `nutrients_per_100g`: leave the cell **empty** (not zero).
- Zero is a valid value (e.g., alcohol = 0 for banana) and should be written as `0` or `0.0`.
- In subtotal/total rows: sum only non-null values. If all items are null for a nutrient, the total is also empty.

---

## Export Template JSON

The export is driven by a template file: `src/config/fineli-export-template-v1.json`

```json
{
  "version": "fineli-diary-v1",
  "sheetName": "Ruokapäiväkirja",
  "metadataColumns": [
    { "key": "date", "header": "Päivä", "width": 12, "type": "date" },
    { "key": "mealType", "header": "Ateria", "width": 14, "type": "text" },
    { "key": "foodName", "header": "Elintarvike", "width": 32, "type": "text" },
    { "key": "amount", "header": "Määrä", "width": 8, "type": "number", "decimals": 1 },
    { "key": "unit", "header": "Yksikkö", "width": 12, "type": "text" },
    { "key": "grams", "header": "Paino (g)", "width": 10, "type": "number", "decimals": 1 }
  ],
  "nutrientColumns": [
    { "key": "ENERC", "header": "Energia (kJ)", "decimals": 0 },
    { "key": "FAT", "header": "Rasva (g)", "decimals": 1 },
    { "key": "CHOAVL", "header": "Hiilihydraatti, imeytyvä (g)", "decimals": 1 },
    { "key": "PROT", "header": "Proteiini (g)", "decimals": 1 },
    { "key": "ALC", "header": "Alkoholi (g)", "decimals": 1 },
    { "key": "OA", "header": "Orgaaniset hapot (g)", "decimals": 1 },
    { "key": "SUGOH", "header": "Sokerialkoholi (g)", "decimals": 1 },
    { "key": "SUGAR", "header": "Sokerit (g)", "decimals": 1 },
    { "key": "FRUS", "header": "Fruktoosi (g)", "decimals": 1 },
    { "key": "GALS", "header": "Galaktoosi (g)", "decimals": 1 },
    { "key": "GLUS", "header": "Glukoosi (g)", "decimals": 1 },
    { "key": "LACS", "header": "Laktoosi (g)", "decimals": 1 },
    { "key": "MALS", "header": "Maltoosi (g)", "decimals": 1 },
    { "key": "SUCS", "header": "Sakkaroosi (g)", "decimals": 1 },
    { "key": "STARCH", "header": "Tärkkelys (g)", "decimals": 1 },
    { "key": "FIBC", "header": "Kuitu (g)", "decimals": 1 },
    { "key": "FIBINS", "header": "Kuitu, liukenematon (g)", "decimals": 1 },
    { "key": "PSACNCS", "header": "Polysakkaridi (g)", "decimals": 1 },
    { "key": "FAFRE", "header": "Rasvahapot yhteensä (g)", "decimals": 1 },
    { "key": "FAPU", "header": "Monityydyttymättömät (g)", "decimals": 1 },
    { "key": "FAMCIS", "header": "Kertatyydyttymättömät (g)", "decimals": 1 },
    { "key": "FASAT", "header": "Tyydyttyneet (g)", "decimals": 1 },
    { "key": "FATRN", "header": "Trans-rasvahapot (g)", "decimals": 1 },
    { "key": "FAPUN3", "header": "n-3 rasvahapot (g)", "decimals": 1 },
    { "key": "FAPUN6", "header": "n-6 rasvahapot (g)", "decimals": 1 },
    { "key": "F18D2CN6", "header": "Linolihappo (mg)", "decimals": 1 },
    { "key": "F18D3N3", "header": "Alfalinoleenihappo (mg)", "decimals": 1 },
    { "key": "F20D5N3", "header": "EPA (mg)", "decimals": 1 },
    { "key": "F22D6N3", "header": "DHA (mg)", "decimals": 1 },
    { "key": "CHOLE", "header": "Kolesteroli (mg)", "decimals": 1 },
    { "key": "STERT", "header": "Sterolit (mg)", "decimals": 1 },
    { "key": "CA", "header": "Kalsium (mg)", "decimals": 1 },
    { "key": "FE", "header": "Rauta (mg)", "decimals": 1 },
    { "key": "ID", "header": "Jodi (µg)", "decimals": 1 },
    { "key": "K", "header": "Kalium (mg)", "decimals": 1 },
    { "key": "MG", "header": "Magnesium (mg)", "decimals": 1 },
    { "key": "NA", "header": "Natrium (mg)", "decimals": 1 },
    { "key": "NACL", "header": "Suola (mg)", "decimals": 1 },
    { "key": "P", "header": "Fosfori (mg)", "decimals": 1 },
    { "key": "SE", "header": "Seleeni (µg)", "decimals": 1 },
    { "key": "ZN", "header": "Sinkki (mg)", "decimals": 1 },
    { "key": "TRP", "header": "Tryptofaani (mg)", "decimals": 1 },
    { "key": "FOL", "header": "Folaatti (µg)", "decimals": 1 },
    { "key": "NIAEQ", "header": "Niasiiniekv. (mg)", "decimals": 1 },
    { "key": "NIA", "header": "Niasiini (mg)", "decimals": 1 },
    { "key": "VITPYRID", "header": "B6-vitamiini (mg)", "decimals": 1 },
    { "key": "RIBF", "header": "B2-vitamiini (mg)", "decimals": 1 },
    { "key": "THIA", "header": "B1-vitamiini (mg)", "decimals": 1 },
    { "key": "VITA", "header": "A-vitamiini (µg)", "decimals": 1 },
    { "key": "CAROTENS", "header": "Karotenoidit (µg)", "decimals": 1 },
    { "key": "VITB12", "header": "B12-vitamiini (µg)", "decimals": 1 },
    { "key": "VITC", "header": "C-vitamiini (mg)", "decimals": 1 },
    { "key": "VITD", "header": "D-vitamiini (µg)", "decimals": 1 },
    { "key": "VITE", "header": "E-vitamiini (mg)", "decimals": 1 },
    { "key": "VITK", "header": "K-vitamiini (µg)", "decimals": 1 }
  ],
  "derivedColumns": [
    { "key": "energyKcal", "header": "Energia (kcal)", "decimals": 0, "formula": "ENERC / 4.184" }
  ],
  "mealTypeLabels": {
    "breakfast": "Aamiainen",
    "lunch": "Lounas",
    "dinner": "Päivällinen",
    "snack": "Välipala",
    "other": "Muu"
  },
  "subtotalLabel": "Yhteensä ({mealType})",
  "dayTotalLabel": "Päivän yhteensä"
}
```

---

## Implementation: xlsx-builder.ts

### Dependencies

```
exceljs: ^4.x
```

### Builder Interface

```typescript
interface ExportInput {
  days: {
    date: string;             // YYYY-MM-DD
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

interface ExportOptions {
  templateVersion?: string;   // default: 'fineli-diary-v1'
}

async function generateExport(
  input: ExportInput,
  options?: ExportOptions
): Promise<Buffer>
```

### Algorithm

```
1. Create workbook + sheet (named from template)
2. Write header row (from template columns)
3. Apply header styling (bold, gray fill, freeze panes)
4. For each day:
   a. For each meal in day:
      i.  For each item in meal:
          - Write food item row (date, meal, food, amount, unit, grams, nutrients)
          - Compute nutrients: value = per100g * grams / 100
      ii. Write meal subtotal row (sum of items)
   b. Write day total row (sum of meals)
5. Auto-fit column widths (or use template widths)
6. Return workbook as Buffer
```

### Subtotal/Total Computation

```typescript
function sumNutrientRows(
  items: { nutrients: Record<string, number | null> }[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item.nutrients)) {
      if (value !== null) {
        result[key] = (result[key] ?? 0) + value;
      }
      // If all values are null, result[key] stays undefined (→ empty cell)
    }
  }
  return result;
}
```

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty meal (0 items) | Skip meal entirely — no subtotal row |
| Empty day (0 meals with items) | Skip day — no day total row |
| Date range with no data | Header row only + info row: "Ei dataa valitulla aikavälillä" |
| Null nutrient value | Empty cell (not "0") |
| Zero nutrient value | Write `0` or `0.0` (valid data) |
| Very long food name | Truncate to 255 chars (Excel cell limit is higher, but keep readable) |
| Unicode (ä, ö, å, µ) | Handled natively by exceljs (UTF-8) |
| Export date range > 90 days | Reject with 400 error |
| Single-day export | Same format, just one day block |
