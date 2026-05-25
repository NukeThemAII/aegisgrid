import { NextResponse } from 'next/server';
import { getPlatformStatus } from '@/lib/platform/platform-status';

export async function GET() {
  return NextResponse.json(getPlatformStatus(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
