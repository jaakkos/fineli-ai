import ExcelJS from 'exceljs';
import type { ExportInput, ExportOptions, MealType } from '@/types';
import { getTemplate, type ExportTemplate } from './template';

const DEFAULT_NUTRIENT_COLUMN_WIDTH = 12;

/**
 * Format date string (YYYY-MM-DD) to European format (dd.mm.yyyy)
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Sum nutrients across items. If ALL items have null for a nutrient, return null.
 * If any item has a value, sum the non-null values.
 */
function sumNutrients(
  items: Array<{ nutrients: Record<string, number | null> }>
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const allKeys = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.nutrients)) {
      allKeys.add(key);
    }
  }
  for (const key of allKeys) {
    const values = items.map((i) => i.nutrients[key]).filter((v): v is number => v != null);
    if (values.length === 0) {
      result[key] = null;
    } else {
      result[key] = values.reduce((a, b) => a + b, 0);
    }
  }
  return result;
}

/**
 * Merge two nutrient totals (for summing meal subtotals into day total).
 */
function mergeNutrientTotals(
  a: Record<string, number | null>,
  b: Record<string, number | null>
): Record<string, number | null> {
  const result = { ...a };
  for (const [key, val] of Object.entries(b)) {
    if (val == null) {
      if (!(key in result)) result[key] = null;
    } else {
      const existing = result[key];
      result[key] = existing != null ? existing + val : val;
    }
  }
  return result;
}

export async function generateExport(
  input: ExportInput,
  options?: ExportOptions
): Promise<Buffer> {
  void options; // Reserved for templateVersion, etc.
  const template = getTemplate();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(template.sheetName);

  // Build column headers from template
  const headers: string[] = [];
  const metadataHeaders = template.metadataColumns.map((c) => c.header);
  const nutrientHeaders = template.nutrientColumns.map((c) => c.header);
  const derivedHeaders = template.derivedColumns.map((c) => c.header);
  headers.push(...metadataHeaders, ...nutrientHeaders, ...derivedHeaders);

  // 1. Set column widths
  const widths: number[] = [];
  for (const col of template.metadataColumns) {
    widths.push(col.width);
  }
  template.nutrientColumns.forEach(() => widths.push(DEFAULT_NUTRIENT_COLUMN_WIDTH));
  template.derivedColumns.forEach(() => widths.push(DEFAULT_NUTRIENT_COLUMN_WIDTH));
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // 2. Write header row (bold, gray fill #E0E0E0, text wrap)
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };
  headerRow.alignment = { wrapText: true };
  headerRow.height = 20;

  // 3. Freeze row 1 + columns A-C
  sheet.views = [
    {
      state: 'frozen',
      xSplit: 3,
      ySplit: 1,
      topLeftCell: 'D2',
      activeCell: 'D2',
    },
  ];

  // 4. For each day
  for (const day of input.days) {
    const dayTotals: { grams: number; nutrients: Record<string, number | null> } = {
      grams: 0,
      nutrients: {},
    };

    // For each meal (skip if 0 items)
    for (const meal of day.meals) {
      if (meal.items.length === 0) continue;

      const mealLabel = getMealLabel(template, meal.mealType, meal.customName);

      // Food item rows
      for (const item of meal.items) {
        const rowData = buildItemRow(template, day.date, mealLabel, item);
        sheet.addRow(rowData);

        // Accumulate for day total
        dayTotals.grams += item.grams;
        dayTotals.nutrients = mergeNutrientTotals(dayTotals.nutrients, item.nutrients);
      }

      // Meal subtotal row
      const mealTotals = sumNutrients(meal.items);
      const mealGrams = meal.items.reduce((s, i) => s + i.grams, 0);
      const subtotalLabel = template.subtotalLabel.replace('{mealType}', mealLabel);
      const subtotalRowData = buildSubtotalRow(
        template,
        subtotalLabel,
        mealGrams,
        mealTotals
      );
      const subtotalRow = sheet.addRow(subtotalRowData);
      styleSubtotalRow(subtotalRow);
    }

    // Day total row (only if we had any meals with items)
    const hasDayData = dayTotals.grams > 0;
    if (hasDayData) {
      const dayTotalRowData = buildDayTotalRow(
        template,
        day.date,
        dayTotals.grams,
        dayTotals.nutrients
      );
      const dayTotalRow = sheet.addRow(dayTotalRowData);
      styleDayTotalRow(dayTotalRow);
    }
  }

  // 5. Return as Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function getMealLabel(
  template: ExportTemplate,
  mealType: MealType,
  customName?: string
): string {
  if (customName) return customName;
  return template.mealTypeLabels[mealType] ?? mealType;
}

function formatNutrientValue(
  value: number | null,
  decimals: number
): string | number | null {
  if (value == null) return null;
  if (value === 0) return 0;
  return Number(value.toFixed(decimals));
}

function getDerivedKcal(nutrients: Record<string, number | null>): number | null {
  const enerc = nutrients['ENERC'];
  if (enerc == null) return null;
  return enerc / 4.184;
}

function buildItemRow(
  template: ExportTemplate,
  dateStr: string,
  mealLabel: string,
  item: ExportInput['days'][0]['meals'][0]['items'][0]
): (string | number | null)[] {
  const row: (string | number | null)[] = [];
  row.push(formatDate(dateStr));
  row.push(mealLabel);
  row.push(item.foodName);
  row.push(item.amount);
  row.push(item.unit);
  row.push(item.grams);

  for (let i = 0; i < template.nutrientColumns.length; i++) {
    const col = template.nutrientColumns[i];
    const val = item.nutrients[col.key];
    row.push(formatNutrientValue(val, col.decimals));
  }
  template.derivedColumns.forEach((col) => {
    const kcal = getDerivedKcal(item.nutrients);
    row.push(formatNutrientValue(kcal, col.decimals));
  });
  return row;
}

function buildSubtotalRow(
  template: ExportTemplate,
  label: string,
  grams: number,
  nutrients: Record<string, number | null>
): (string | number | null)[] {
  const row: (string | number | null)[] = [];
  row.push(''); // date empty for subtotal
  row.push(''); // meal type empty
  row.push(label);
  row.push(''); // amount
  row.push(''); // unit
  row.push(grams);

  for (const col of template.nutrientColumns) {
    const val = nutrients[col.key];
    row.push(formatNutrientValue(val ?? null, col.decimals));
  }
  for (const col of template.derivedColumns) {
    const kcal = getDerivedKcal(nutrients);
    row.push(formatNutrientValue(kcal, col.decimals));
  }
  return row;
}

function buildDayTotalRow(
  template: ExportTemplate,
  dateStr: string,
  grams: number,
  nutrients: Record<string, number | null>
): (string | number | null)[] {
  const row: (string | number | null)[] = [];
  row.push(formatDate(dateStr));
  row.push('');
  row.push(template.dayTotalLabel);
  row.push('');
  row.push('');
  row.push(grams);

  for (const col of template.nutrientColumns) {
    const val = nutrients[col.key];
    row.push(formatNutrientValue(val ?? null, col.decimals));
  }
  for (const col of template.derivedColumns) {
    const kcal = getDerivedKcal(nutrients);
    row.push(formatNutrientValue(kcal, col.decimals));
  }
  return row;
}

function styleSubtotalRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F5F5' },
  };
  row.border = {
    top: { style: 'thin' },
  };
}

function styleDayTotalRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8E8' },
  };
  row.border = {
    top: { style: 'double' },
  };
}
