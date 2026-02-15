/**
 * Centralised environment config.
 * Import this instead of reading process.env directly.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  /** SQLite file path or PostgreSQL connection string */
  DATABASE_URL: optional('DATABASE_URL', 'file:./data/fineli.db'),

  /** Secret for signing session cookies */
  SESSION_SECRET: required('SESSION_SECRET'),

  /** Fineli API base URL */
  FINELI_API_BASE_URL: optional('FINELI_API_BASE_URL', 'https://fineli.fi/fineli/api/v1'),

  /** Default language for Fineli queries */
  FINELI_DEFAULT_LANG: optional('FINELI_DEFAULT_LANG', 'fi') as 'fi' | 'en' | 'sv',

  /** Public app URL */
  APP_URL: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

  /** Is production? */
  IS_PROD: process.env.NODE_ENV === 'production',
} as const;
