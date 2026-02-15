'use client';

interface QuickReplyOption {
  key: string;
  label: string;
  sublabel?: string;
}

interface QuickReplyButtonsProps {
  options: QuickReplyOption[];
  onSelect: (key: string) => void;
  disabled?: boolean;
  selectedKey?: string;
  layout?: 'horizontal' | 'vertical';
}

export default function QuickReplyButtons({
  options,
  onSelect,
  disabled = false,
  selectedKey,
  layout,
}: QuickReplyButtonsProps) {
  const effectiveLayout = layout ?? (options.length <= 3 ? 'horizontal' : 'vertical');

  return (
    <div
      role="group"
      aria-label="Valitse vaihtoehto"
      className={
        effectiveLayout === 'horizontal'
          ? 'flex flex-wrap gap-1.5'
          : 'flex flex-col gap-1'
      }
    >
      {options.map((opt) => {
        const isSelected = selectedKey === opt.key;
        return (
          <button
            key={opt.key}
            disabled={disabled}
            onClick={() => onSelect(opt.key)}
            className={`
              rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
              ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }
              ${disabled && !isSelected ? 'opacity-40' : ''}
            `}
          >
            <span className="font-medium">{opt.label}</span>
            {opt.sublabel && (
              <span className="ml-1 text-xs text-gray-500">{opt.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
