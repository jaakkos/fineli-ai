import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { fineliClient } from '@/lib/fineli/singleton';
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

  const food = await fineliClient.getFood(foodId);
  return NextResponse.json({ data: food });
  } catch (error) {
    return handleRouteError(error);
  }
}
