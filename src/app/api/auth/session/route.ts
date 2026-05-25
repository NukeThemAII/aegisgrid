import { NextResponse } from 'next/server';
import { parseAppSubject } from '@/lib/auth/app-auth';

export async function GET(req: Request) {
  const subject = parseAppSubject(req);

  return NextResponse.json({
    authenticated: subject.role !== 'anonymous',
    role: subject.role,
    ...(subject.subjectId ? { subject_id: subject.subjectId } : {}),
    entitlements: subject.entitlements,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
