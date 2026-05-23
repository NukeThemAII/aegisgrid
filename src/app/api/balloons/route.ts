import { NextResponse } from 'next/server';

const fetchedAt = () => new Date().toISOString();

export async function GET() {
  const now = fetchedAt();

  return NextResponse.json(
    {
      status: 'source_unavailable',
      message: 'Balloon/radiosonde source adapter is not configured yet.',
      balloons: [],
      featureCollection: {
        type: 'FeatureCollection',
        features: [],
      },
      source: {
        source: 'AegisGrid placeholder',
        source_url: null,
        fetched_at: now,
        license: 'TBD',
        attribution: 'Source unavailable; adapter pending licensing review.',
        confidence: 'low',
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    },
  );
}
