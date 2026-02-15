import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/session';

export const ERROR_CODES = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Returns a JSON error response with consistent shape.
 */
export function apiErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

/**
 * Handles unexpected errors: logs in development and returns 500 with INTERNAL_ERROR.
 */
export function handleRouteError(error: unknown): NextResponse {
  // Auth errors → proper 401/403 (not 500)
  if (error instanceof AuthError) {
    return apiErrorResponse(error.code, error.message, error.statusCode);
  }
  // Always log the full error server-side
  console.error('[API Error]', error);
  // In production, never expose internal error details to the client
  const message =
    process.env.NODE_ENV === 'development' && error instanceof Error
      ? error.message
      : 'Odottamaton virhe. Yritä uudelleen.';
  return apiErrorResponse(ERROR_CODES.INTERNAL_ERROR, message, 500);
}
