'use client';

import { useState } from 'react';

interface NutrientSummaryProps {
  nutrients: Record<string, number>;
}

interface NutrientRow {
  label: string;
  code: string;
  unit: string;
  decimals?: number;
}

const primaryNutrients: NutrientRow[] = [
  { label: 'Energia', code: 'ENERC', unit: 'kcal', decimals: 0 },
  { label: 'Proteiini', code: 'PROT', unit: 'g', decimals: 1 },
  { label: 'Rasva', code: 'FAT', unit: 'g', decimals: 1 },
  { label: 'Hiilihydraatit', code: 'CHOAVL', unit: 'g', decimals: 1 },
  { label: 'Kuitu', code: 'FIBC', unit: 'g', decimals: 1 },
];

const expandedGroups: { title: string; nutrients: NutrientRow[] }[] = [
  {
    title: 'Rasvat',
    nutrients: [
      { label: 'Tyydyttyneet', code: 'FASAT', unit: 'g', decimals: 1 },
      { label: 'Kertatyydyttymättömät', code: 'FAMCIS', unit: 'g', decimals: 1 },
      { label: 'Monityydyttymättömät', code: 'FAPU', unit: 'g', decimals: 1 },
    ],
  },
  {
    title: 'Sokerit',
    nutrients: [
      { label: 'Sokerit yhteensä', code: 'SUGAR', unit: 'g', decimals: 1 },
    ],
  },
  {
    title: 'Kivennäisaineet',
    nutrients: [
      { label: 'Natrium', code: 'NA', unit: 'mg', decimals: 0 },
      { label: 'Kalium', code: 'K', unit: 'mg', decimals: 0 },
      { label: 'Kalsium', code: 'CA', unit: 'mg', decimals: 0 },
      { label: 'Rauta', code: 'FE', unit: 'mg', decimals: 1 },
    ],
  },
  {
    title: 'Vitamiinit',
    nutrients: [
      { label: 'C-vitamiini', code: 'VITC', unit: 'mg', decimals: 0 },
      { label: 'D-vitamiini', code: 'VITD', unit: 'µg', decimals: 1 },
      { label: 'B12-vitamiini', code: 'VITB12', unit: 'µg', decimals: 1 },
    ],
  },
];

function formatValue(value: number | undefined, decimals: number): string {
  if (value === undefined || isNaN(value)) return '0';
  return value.toFixed(decimals);
}

export default function NutrientSummary({ nutrients }: NutrientSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const hasData = Object.values(nutrients).some((v) => v > 0);

  if (!hasData) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-sm text-gray-400">Ei ravintoarvoja vielä.</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Ravintoarvot"
      className="rounded-lg border border-gray-200 bg-white"
    >
      {/* Primary nutrients - always visible */}
      <dl className="divide-y divide-gray-100">
        {primaryNutrients.map((n) => (
          <div key={n.code} className="flex items-center justify-between px-4 py-2">
            <dt className="text-sm text-gray-600">{n.label}</dt>
            <dd className="m-0 text-sm font-medium text-gray-900">
              {formatValue(nutrients[n.code], n.decimals ?? 1)} {n.unit}
            </dd>
          </div>
        ))}
      </dl>

      {/* Expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-center gap-1 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        aria-expanded={expanded}
        aria-controls="nutrient-details"
      >
        {expanded ? 'Piilota lisätiedot' : 'Näytä lisää ravintoaineita'}
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div id="nutrient-details" className="border-t border-gray-200">
          {expandedGroups.map((group) => (
            <div key={group.title}>
              <div className="bg-gray-50 px-4 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.title}
                </span>
              </div>
              <dl className="divide-y divide-gray-100">
                {group.nutrients.map((n) => (
                  <div
                    key={n.code}
                    className="flex items-center justify-between px-4 py-1.5"
                  >
                    <dt className="text-xs text-gray-500">{n.label}</dt>
                    <dd className="m-0 text-xs font-medium text-gray-700">
                      {formatValue(nutrients[n.code], n.decimals ?? 1)} {n.unit}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
