'use client';

import { useQuery } from '@tanstack/react-query';

export function useFineliSearch(query: string) {
  return useQuery({
    queryKey: ['fineli', 'search', query],
    queryFn: async () => {
      const res = await fetch(
        `/api/fineli/search?q=${encodeURIComponent(query)}&lang=fi`,
      );
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}
