import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getFoodDetails } from '@/lib/fineli/local-index';
import { handleRouteError } from '@/lib/utils/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { id } = await params;
  const foodId = parseInt(id, 10);
  if (isNaN(foodId) || foodId <= 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid food ID',
        },
      },
      { status: 400 }
    );
  }

  const food = getFoodDetails(foodId);
  if (!food) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: `Food ${foodId} not found`,
        },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: food });
  } catch (error) {
    return handleRouteError(error);
  }
}
