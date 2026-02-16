/**
 * Build a compact JSON index from Fineli Open Data.
 *
 * Run: npx tsx scripts/build-fineli-index.ts
 *
 * Fetches data from Fineli (ZIP packages), extracts CSVs, and outputs
 * data/fineli/index.json for local food lookup, recipe decomposition, and
 * portion sizes. Search uses FlexSearch at runtime (index built from foods).
 *
 * Data source: Finnish Institute for Health and Welfare (THL), Fineli.
 * License: CC-BY 4.0 — https://fineli.fi/fineli/fi/avoin-data
 *
 * Packages used:
 * - Basic 1 (47): 4 232 foods, 55 components
 * - Basic 2 (49): 4 232 foods, 74 components — primary for basic foods
 * - Industry (48): 1 370 ingredients, 40 components — added for industry set
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';

const DATA_DIR = join(__dirname, '..', 'data', 'fineli');

const FINELI_PACKAGES = [
  { id: 47, url: 'https://fineli.fi/fineli/content/file/47', name: 'Basic 1 (55 components)' },
  { id: 49, url: 'https://fineli.fi/fineli/content/file/49', name: 'Basic 2 (74 components)' },
  { id: 48, url: 'https://fineli.fi/fineli/content/file/48', name: 'Industry ingredients' },
];

// ---------------------------------------------------------------------------
// Download and extract
// ---------------------------------------------------------------------------

async function downloadZip(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

function parseCSVFromBuffer(raw: Buffer): Record<string, string>[] {
  const text = raw.toString('latin1').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(';');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
}

/** Find a CSV file in ZIP (root or nested dir) by filename */
function findCsvInZip(zip: AdmZip, baseName: string): Buffer | null {
  const want = baseName.toLowerCase();
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const base = e.entryName.split('/').pop()?.toLowerCase();
    if (base === want) return e.getData();
  }
  return null;
}

interface FoodMeta {
  id: number;
  name: string;
  type: 'FOOD' | 'DISH';
  process: string;
  igclass: string;
  fuclass: string;
}

interface RecipeIngredient {
  id: number;
  grams: number;
}

interface PortionSize {
  unit: string;
  grams: number;
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  // Merge maps: later package overwrites/adds. Key = foodId or composite key.
  const foodRowsById = new Map<number, Record<string, string>>();
  const foodNameById = new Map<number, string>();
  const contribRows: Record<string, { foodId: number; confdid: number; mass: number }> = {};
  const portionRowsByKey = new Map<string, { foodId: number; unit: string; mass: number }>();
  const componentRowsByKey = new Map<string, { foodId: number; code: string; value: number }>();
  const unitLabels: Record<string, string> = {};

  for (const pkg of FINELI_PACKAGES) {
    console.log(`Downloading ${pkg.name} (${pkg.url})...`);
    const zipBuf = await downloadZip(pkg.url);
    const zip = new AdmZip(zipBuf);

    const foodCsv = findCsvInZip(zip, 'food.csv');
    if (foodCsv) {
      const rows = parseCSVFromBuffer(foodCsv);
      for (const row of rows) {
        const id = parseInt(row.FOODID, 10);
        if (!isNaN(id)) foodRowsById.set(id, row);
      }
    }

    const nameCsv = findCsvInZip(zip, 'foodname_FI.csv');
    if (nameCsv) {
      const rows = parseCSVFromBuffer(nameCsv);
      for (const row of rows) {
        const id = parseInt(row.FOODID, 10);
        if (!isNaN(id) && row.FOODNAME) foodNameById.set(id, row.FOODNAME);
      }
    }

    const contribCsv = findCsvInZip(zip, 'contribfood.csv');
    if (contribCsv) {
      const rows = parseCSVFromBuffer(contribCsv);
      for (const row of rows) {
        const foodId = parseInt(row.FOODID, 10);
        const confdid = parseInt(row.CONFDID, 10);
        const mass = parseFloat((row.MASS ?? '0').replace(',', '.'));
        if (!isNaN(foodId) && !isNaN(confdid) && !isNaN(mass))
          contribRows[`${foodId}:${confdid}`] = { foodId, confdid, mass };
      }
    }

    const portionCsv = findCsvInZip(zip, 'foodaddunit.csv');
    if (portionCsv) {
      const rows = parseCSVFromBuffer(portionCsv);
      for (const row of rows) {
        const foodId = parseInt(row.FOODID, 10);
        const unit = row.FOODUNIT ?? '';
        const mass = parseFloat((row.MASS ?? '0').replace(',', '.'));
        if (!isNaN(foodId) && unit && !isNaN(mass))
          portionRowsByKey.set(`${foodId}:${unit}`, { foodId, unit, mass });
      }
    }

    const compCsv = findCsvInZip(zip, 'component_value.csv');
    if (compCsv) {
      const rows = parseCSVFromBuffer(compCsv);
      for (const row of rows) {
        const foodId = parseInt(row.FOODID, 10);
        const code = row.EUFDNAME ?? '';
        const value = parseFloat((row.BESTLOC ?? '0').replace(',', '.'));
        if (!isNaN(foodId) && code && !isNaN(value))
          componentRowsByKey.set(`${foodId}:${code}`, { foodId, code, value });
      }
    }

    const unitCsv = findCsvInZip(zip, 'foodunit_FI.csv');
    if (unitCsv) {
      const rows = parseCSVFromBuffer(unitCsv);
      for (const row of rows) {
        const code = row.THSCODE ?? '';
        const label = row.DESCRIPT ?? '';
        if (code && label) unitLabels[code] = label;
      }
    }
  }

  console.log(`Merged: ${foodRowsById.size} foods, ${foodNameById.size} names`);

  // ---------------------------------------------------------------------------
  // 1. Build food index (metadata)
  // ---------------------------------------------------------------------------

  const foodIndex: FoodMeta[] = [];
  for (const [id, row] of foodRowsById) {
    const name = foodNameById.get(id) ?? row.FOODNAME ?? '';
    if (!name) continue;
    foodIndex.push({
      id,
      name,
      type: row.FOODTYPE === 'DISH' ? 'DISH' : 'FOOD',
      process: row.PROCESS ?? '',
      igclass: row.IGCLASS ?? '',
      fuclass: row.FUCLASS ?? '',
    });
  }

  console.log(`Foods: ${foodIndex.length} entries`);

  // ---------------------------------------------------------------------------
  // 2. Recipes (contribfood)
  // ---------------------------------------------------------------------------

  const recipesMap = new Map<number, RecipeIngredient[]>();
  for (const { foodId, confdid, mass } of Object.values(contribRows)) {
    if (confdid === 922) continue; // skip water
    if (!recipesMap.has(foodId)) recipesMap.set(foodId, []);
    recipesMap.get(foodId)!.push({ id: confdid, grams: mass });
  }

  const recipes: Record<number, { ingredients: { id: number; name: string; grams: number }[] }> = {};
  for (const [foodId, ingredients] of recipesMap) {
    recipes[foodId] = {
      ingredients: ingredients.map((ing) => ({
        id: ing.id,
        name: foodNameById.get(ing.id) ?? `food-${ing.id}`,
        grams: Math.round(ing.grams * 10) / 10,
      })),
    };
  }
  console.log(`Recipes: ${Object.keys(recipes).length} foods with ingredients`);

  // ---------------------------------------------------------------------------
  // 3. Portions
  // ---------------------------------------------------------------------------

  const portionsMap = new Map<number, PortionSize[]>();
  for (const { foodId, unit, mass } of portionRowsByKey.values()) {
    if (!portionsMap.has(foodId)) portionsMap.set(foodId, []);
    portionsMap.get(foodId)!.push({ unit, grams: Math.round(mass * 10) / 10 });
  }
  const portions: Record<number, PortionSize[]> = {};
  for (const [foodId, sizes] of portionsMap) {
    portions[foodId] = sizes;
  }
  console.log(`Portions: ${Object.keys(portions).length} foods with portion data`);

  // ---------------------------------------------------------------------------
  // 4. Nutrients (component_value)
  // ---------------------------------------------------------------------------

  const nutrientsMap = new Map<number, Record<string, number>>();
  for (const { foodId, code, value } of componentRowsByKey.values()) {
    if (!nutrientsMap.has(foodId)) nutrientsMap.set(foodId, {});
    nutrientsMap.get(foodId)![code] = Math.round(value * 100) / 100;
  }
  const nutrients: Record<number, Record<string, number>> = {};
  for (const [foodId, vals] of nutrientsMap) {
    const compact: Record<string, number> = {};
    for (const [code, value] of Object.entries(vals)) {
      if (value !== 0) compact[code] = value;
    }
    if (Object.keys(compact).length > 0) nutrients[foodId] = compact;
  }
  console.log(`Nutrients: ${Object.keys(nutrients).length} foods with nutrient data`);
  console.log(`Unit labels: ${Object.keys(unitLabels).length} unit types`);

  // ---------------------------------------------------------------------------
  // 5. Write index.json (no nameIndex — FlexSearch built at runtime)
  // ---------------------------------------------------------------------------

  const index = {
    _meta: {
      source: 'Finnish Institute for Health and Welfare (THL), Fineli',
      license: 'CC-BY 4.0',
      url: 'https://fineli.fi/fineli/fi/avoin-data',
      generated: new Date().toISOString(),
      foodCount: foodIndex.length,
      recipeCount: Object.keys(recipes).length,
      nutrientCount: Object.keys(nutrients).length,
    },
    foods: foodIndex,
    recipes,
    portions,
    nutrients,
    unitLabels,
  };

  const outPath = join(DATA_DIR, 'index.json');
  writeFileSync(outPath, JSON.stringify(index));

  const jsonStr = JSON.stringify(index);
  console.log(`\nWritten: ${outPath}`);
  console.log(`Size: ${(jsonStr.length / 1024).toFixed(0)} KB (uncompressed)`);
  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
