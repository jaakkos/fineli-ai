import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { fineliClient } from '@/lib/fineli/singleton';
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

  const { q, lang } = parsed.data;

  try {
    const results = await fineliClient.searchFoods(q, lang);
    const ranked = rankSearchResults(results, q);
    return NextResponse.json({ data: ranked });
  } catch (err) {
    console.error('[Fineli search]', err);
    return NextResponse.json(
      {
        error: {
          code: 'FINELI_ERROR',
          message: err instanceof Error ? err.message : 'Search failed',
        },
      },
      { status: 502 }
    );
  }
  } catch (error) {
    return handleRouteError(error);
  }
}
