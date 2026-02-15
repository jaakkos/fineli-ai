import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateExport } from '../xlsx-builder';
import { getTemplate, getAllColumns } from '../template';
import type { ExportInput } from '@/types';

// Helper: read workbook from buffer
async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}


// Minimal export input factory
function makeInput(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    days: [
      {
        date: '2026-02-14',
        meals: [
          {
            mealType: 'breakfast',
            items: [
              {
                foodName: 'Kaurapuuro, vedellä',
                amount: 1,
                unit: 'annos',
                grams: 300,
                nutrients: {
                  ENERC: 540,
                  FAT: 2.7,
                  CHOAVL: 25.2,
                  PROT: 4.5,
                  FIBC: 2.1,
                },
              },
              {
                foodName: 'Maito, kevyt 1%',
                amount: 2,
                unit: 'dl',
                grams: 200,
                nutrients: {
                  ENERC: 374,
                  FAT: 2.0,
                  CHOAVL: 9.6,
                  PROT: 6.8,
                  FIBC: 0,
                },
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('generateExport', () => {
  it('returns a Buffer', async () => {
    const buffer = await generateExport(makeInput());
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('creates a valid Excel workbook', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    expect(wb.worksheets).toHaveLength(1);
  });

  it('uses Finnish sheet name from template', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    // Sheet name comes from template
    expect(sheet.name).toBeTruthy();
  });

  it('has header row with bold font', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    const headerRow = sheet.getRow(1);
    expect(headerRow.font?.bold).toBe(true);
  });

  it('has frozen panes', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    expect(sheet.views).toHaveLength(1);
    expect(sheet.views[0].state).toBe('frozen');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exceljs WorksheetView doesn't expose xSplit/ySplit in types
    expect((sheet.views[0] as any).xSplit).toBe(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sheet.views[0] as any).ySplit).toBe(1);
  });

  it('formats date as dd.mm.yyyy', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    // Row 2 is first data row (row 1 is header)
    const row2 = sheet.getRow(2);
    const dateValue = row2.getCell(1).value;
    expect(dateValue).toBe('14.02.2026');
  });

  it('has food name in food column', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    const row2 = sheet.getRow(2);
    // Column 3 is food name (Date, Meal, Food)
    expect(row2.getCell(3).value).toBe('Kaurapuuro, vedellä');
  });

  it('has grams in grams column', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    const row2 = sheet.getRow(2);
    // Column 6 is grams (Date, Meal, Food, Amount, Unit, Grams)
    expect(row2.getCell(6).value).toBe(300);
  });

  it('generates subtotal row after meal items', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    // Row 1: header, Row 2: item 1, Row 3: item 2, Row 4: subtotal
    const subtotalRow = sheet.getRow(4);
    const label = subtotalRow.getCell(3).value;
    expect(typeof label).toBe('string');
    expect((label as string).toLowerCase()).toContain('aamiainen');
    expect(subtotalRow.font?.bold).toBe(true);
  });

  it('generates day total row', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    // Row 5 should be day total
    const dayTotalRow = sheet.getRow(5);
    const label = dayTotalRow.getCell(3).value;
    expect(typeof label).toBe('string');
    // Day total has date in first column
    expect(dayTotalRow.getCell(1).value).toBe('14.02.2026');
    expect(dayTotalRow.font?.bold).toBe(true);
  });

  it('sums grams in subtotal', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    const subtotalRow = sheet.getRow(4);
    // Grams column (6) should be 300 + 200 = 500
    expect(subtotalRow.getCell(6).value).toBe(500);
  });

  it('skips meals with 0 items', async () => {
    const input: ExportInput = {
      days: [
        {
          date: '2026-02-14',
          meals: [
            { mealType: 'breakfast', items: [] },
            {
              mealType: 'lunch',
              items: [
                {
                  foodName: 'Kanafilee',
                  amount: 1,
                  unit: 'annos',
                  grams: 150,
                  nutrients: { ENERC: 600, PROT: 30 },
                },
              ],
            },
          ],
        },
      ],
    };
    const buffer = await generateExport(input);
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    // Only 1 header + 1 item + 1 subtotal + 1 day total = 4 rows
    expect(sheet.rowCount).toBe(4);
  });

  it('handles multiple days', async () => {
    const input: ExportInput = {
      days: [
        {
          date: '2026-02-14',
          meals: [
            {
              mealType: 'breakfast',
              items: [
                { foodName: 'Item A', amount: 1, unit: 'g', grams: 100, nutrients: { ENERC: 100 } },
              ],
            },
          ],
        },
        {
          date: '2026-02-15',
          meals: [
            {
              mealType: 'lunch',
              items: [
                { foodName: 'Item B', amount: 1, unit: 'g', grams: 200, nutrients: { ENERC: 200 } },
              ],
            },
          ],
        },
      ],
    };
    const buffer = await generateExport(input);
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    // Day 1: header(1) + item(1) + subtotal(1) + dayTotal(1) = 4
    // Day 2: item(1) + subtotal(1) + dayTotal(1) = 3
    // Total = 7
    expect(sheet.rowCount).toBe(7);
  });

  it('handles null nutrients gracefully', async () => {
    const input: ExportInput = {
      days: [
        {
          date: '2026-02-14',
          meals: [
            {
              mealType: 'breakfast',
              items: [
                {
                  foodName: 'Mystery food',
                  amount: 1,
                  unit: 'g',
                  grams: 100,
                  nutrients: { ENERC: null as unknown as number, FAT: 5 },
                },
              ],
            },
          ],
        },
      ],
    };
    // Should not throw
    const buffer = await generateExport(input);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('has all 55 nutrient columns plus metadata and derived', async () => {
    const buffer = await generateExport(makeInput());
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    const headerRow = sheet.getRow(1);
    // Count cells in header
    let cellCount = 0;
    headerRow.eachCell({ includeEmpty: false }, () => { cellCount++; });
    // Should have: 6 metadata + 55 nutrients + 1 derived (kcal) = 62
    const template = getTemplate();
    const expectedCount = template.metadataColumns.length + template.nutrientColumns.length + template.derivedColumns.length;
    expect(cellCount).toBe(expectedCount);
  });

  it('uses custom meal name when provided', async () => {
    const input: ExportInput = {
      days: [
        {
          date: '2026-02-14',
          meals: [
            {
              mealType: 'other',
              customName: 'Yöpala',
              items: [
                { foodName: 'Jogurtti', amount: 1, unit: 'kpl', grams: 200, nutrients: { ENERC: 400 } },
              ],
            },
          ],
        },
      ],
    };
    const buffer = await generateExport(input);
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];

    const row2 = sheet.getRow(2);
    expect(row2.getCell(2).value).toBe('Yöpala');
  });

  it('handles empty days array', async () => {
    const input: ExportInput = { days: [] };
    const buffer = await generateExport(input);
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    // Only header row
    expect(sheet.rowCount).toBe(1);
  });

  it('handles day with no meals', async () => {
    const input: ExportInput = {
      days: [{ date: '2026-02-14', meals: [] }],
    };
    const buffer = await generateExport(input);
    const wb = await readWorkbook(buffer);
    const sheet = wb.worksheets[0];
    // Only header row (no data rows for empty day)
    expect(sheet.rowCount).toBe(1);
  });
});

describe('Export Template', () => {
  it('loads template with required fields', () => {
    const template = getTemplate();
    expect(template.version).toBeTruthy();
    expect(template.sheetName).toBeTruthy();
    expect(template.metadataColumns).toBeInstanceOf(Array);
    expect(template.nutrientColumns).toBeInstanceOf(Array);
    expect(template.derivedColumns).toBeInstanceOf(Array);
    expect(template.mealTypeLabels).toBeDefined();
    expect(template.subtotalLabel).toBeTruthy();
    expect(template.dayTotalLabel).toBeTruthy();
  });

  it('has Finnish meal type labels', () => {
    const template = getTemplate();
    expect(template.mealTypeLabels['breakfast']).toBeTruthy();
    expect(template.mealTypeLabels['lunch']).toBeTruthy();
    expect(template.mealTypeLabels['dinner']).toBeTruthy();
  });

  it('has 55 nutrient columns', () => {
    const template = getTemplate();
    expect(template.nutrientColumns).toHaveLength(55);
  });

  it('getAllColumns returns all columns', () => {
    const template = getTemplate();
    const all = getAllColumns(template);
    const expectedLen = template.metadataColumns.length + template.nutrientColumns.length + template.derivedColumns.length;
    expect(all).toHaveLength(expectedLen);
  });

  it('nutrient columns have key and header', () => {
    const template = getTemplate();
    for (const col of template.nutrientColumns) {
      expect(col.key).toBeTruthy();
      expect(col.header).toBeTruthy();
      expect(typeof col.decimals).toBe('number');
    }
  });
});
