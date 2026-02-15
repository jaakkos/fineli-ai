import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/** Clear session cookie (client-side logout). */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set('fineli_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.json({ data: { message: 'Logged out' } });
}
