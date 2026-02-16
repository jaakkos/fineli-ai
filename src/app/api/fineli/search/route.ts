import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { searchFoods } from '@/lib/fineli/local-index';
import { rankSearchResults } from '@/lib/fineli/search';
import { handleRouteError } from '@/lib/utils/api-error';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  lang: z.enum(['fi', 'en', 'sv']).default('fi'),
});

export async function GET(request: NextRequest) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get('q') ?? '',
    lang: searchParams.get('lang') ?? 'fi',
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query: "q" required (max 200 chars), "lang" must be fi, en, or sv',
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const { q } = parsed.data;

  const results = searchFoods(q);
  const ranked = rankSearchResults(results, q);
  return NextResponse.json({ data: ranked });
  } catch (error) {
    return handleRouteError(error);
  }
}
