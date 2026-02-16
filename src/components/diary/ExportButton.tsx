'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

interface ExportButtonProps {
  defaultDate: string;
  /** Earliest diary entry date (from API) — used as default "from" */
  entryMinDate?: string | null;
  /** Latest diary entry date (from API) — used as default "to" */
  entryMaxDate?: string | null;
  onExport: (from: string, to: string) => Promise<void>;
  isExporting: boolean;
}

export default function ExportButton({
  defaultDate,
  entryMinDate,
  entryMaxDate,
  onExport,
  isExporting,
}: ExportButtonProps) {
  const [showRange, setShowRange] = useState(false);
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);

  const handleOpen = () => {
    setFromDate(entryMinDate ?? defaultDate);
    setToDate(entryMaxDate ?? defaultDate);
    setShowRange(true);
  };

  const handleExport = async () => {
    await onExport(fromDate, toDate);
    setShowRange(false);
  };

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        loading={isExporting}
        onClick={() => (showRange ? setShowRange(false) : handleOpen())}
        aria-label="Vie Excel-tiedostona"
        aria-expanded={showRange}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {isExporting ? 'Luodaan...' : 'Vie Excel'}
      </Button>

      {showRange && !isExporting && (
        <div
          className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
          role="dialog"
          aria-label="Vienti-asetukset"
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="export-from" className="block text-xs font-medium text-gray-600 mb-1">
                Alkaen
              </label>
              <input
                id="export-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="export-to" className="block text-xs font-medium text-gray-600 mb-1">
                Asti
              </label>
              <input
                id="export-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleExport}>
                Lataa
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRange(false)}
              >
                Peruuta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
