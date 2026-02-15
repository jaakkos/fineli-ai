import { FineliClient } from './client';
import { MemoryCache } from '@/lib/utils/cache';
import { portionConverter } from './portions';

const cache = new MemoryCache();

export const fineliClient = new FineliClient({
  baseUrl:
    process.env.FINELI_API_BASE_URL || 'https://fineli.fi/fineli/api/v1',
  defaultLang:
    (process.env.FINELI_DEFAULT_LANG as 'fi' | 'en' | 'sv') || 'fi',
  cache,
});

export { portionConverter };
