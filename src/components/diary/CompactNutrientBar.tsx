'use client';

interface CompactNutrientBarProps {
  nutrients: Record<string, number>;
}

function fmt(value: number | undefined, decimals: number = 0): string {
  if (value === undefined || isNaN(value)) return '0';
  return value.toFixed(decimals);
}

/**
 * Compact always-visible nutrient summary bar.
 * Shows kcal, protein, fat, carbs in a single horizontal row.
 */
export default function CompactNutrientBar({ nutrients }: CompactNutrientBarProps) {
  const kcal = nutrients.ENERC ?? 0;
  const protein = nutrients.PROT ?? 0;
  const fat = nutrients.FAT ?? 0;
  const carbs = nutrients.CHOAVL ?? 0;
  const hasData = kcal > 0 || protein > 0 || fat > 0 || carbs > 0;

  const fiber = nutrients.FIBC ?? 0;

  return (
    <div
      role="region"
      aria-label="Aterian ravintoarvot yhteenveto"
      className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 text-xs sm:gap-4 sm:text-sm"
    >
      <span aria-label={`Energia ${fmt(kcal)} kilokaloria`} className="flex items-center gap-1">
        <span className="font-semibold text-orange-600" aria-hidden="true">
          {fmt(kcal)}
        </span>
        <span className="text-gray-400" aria-hidden="true">
          kcal
        </span>
      </span>
      <div className="h-3 w-px bg-gray-200" aria-hidden="true" />
      <span aria-label={`Proteiini ${fmt(protein, 1)} grammaa`} className="flex items-center gap-1">
        <span
          className={'font-medium ' + (hasData ? 'text-blue-600' : 'text-gray-400')}
          aria-hidden="true"
        >
          {fmt(protein, 1)}
        </span>
        <span className="text-gray-400" aria-hidden="true">
          P
        </span>
      </span>
      <span aria-label={`Rasva ${fmt(fat, 1)} grammaa`} className="flex items-center gap-1">
        <span
          className={'font-medium ' + (hasData ? 'text-yellow-600' : 'text-gray-400')}
          aria-hidden="true"
        >
          {fmt(fat, 1)}
        </span>
        <span className="text-gray-400" aria-hidden="true">
          R
        </span>
      </span>
      <span aria-label={`Hiilihydraatit ${fmt(carbs, 1)} grammaa`} className="flex items-center gap-1">
        <span
          className={'font-medium ' + (hasData ? 'text-green-600' : 'text-gray-400')}
          aria-hidden="true"
        >
          {fmt(carbs, 1)}
        </span>
        <span className="text-gray-400" aria-hidden="true">
          HH
        </span>
      </span>
      {hasData && (
        <>
          <div className="h-3 w-px bg-gray-200" aria-hidden="true" />
          <span aria-label={`Kuitu ${fmt(fiber, 1)} grammaa`} className="flex items-center gap-1">
            <span className="font-medium text-purple-600" aria-hidden="true">
              {fmt(fiber, 1)}
            </span>
            <span className="text-gray-400" aria-hidden="true">
              kuitu
            </span>
          </span>
        </>
      )}
    </div>
  );
}
