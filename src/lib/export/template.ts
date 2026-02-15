import templateData from '@/config/fineli-export-template-v1.json';

export interface MetadataColumnDef {
  key: string;
  header: string;
  width: number;
  type: 'date' | 'text' | 'number';
  decimals?: number;
}

export interface NutrientColumnDef {
  key: string;
  header: string;
  decimals: number;
}

export interface DerivedColumnDef {
  key: string;
  header: string;
  decimals: number;
  formula: string;
}

export interface ExportTemplate {
  version: string;
  sheetName: string;
  metadataColumns: MetadataColumnDef[];
  nutrientColumns: NutrientColumnDef[];
  derivedColumns: DerivedColumnDef[];
  mealTypeLabels: Record<string, string>;
  subtotalLabel: string;
  dayTotalLabel: string;
}

export function getTemplate(): ExportTemplate {
  return templateData as ExportTemplate;
}

export function getAllColumns(
  template: ExportTemplate
): Array<MetadataColumnDef | NutrientColumnDef | DerivedColumnDef> {
  return [
    ...template.metadataColumns,
    ...template.nutrientColumns,
    ...template.derivedColumns,
  ];
}
