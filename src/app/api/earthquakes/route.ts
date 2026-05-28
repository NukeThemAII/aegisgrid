
import { NextResponse } from 'next/server';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * AEGISGRID — Earthquake Data API
 * Fetches real-time seismic events from USGS (last 24h, M2.5+)
 * No API key required
 */

interface UsgsFeature {
  id: string;
  geometry?: { coordinates?: [number, number, number] };
  properties?: {
    mag: number;
    place: string;
    time: number;
    url: string;
    tsunami: number;
    type: string;
    felt: number | null;
    alert: string | null;
  };
}

export async function GET(request: Request) {
  const rateLimitResponse = enforceRateLimit(RATE_LIMITS['earthquakes'], request);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ earthquakes: [], error: 'USGS unavailable' });
    }

    const data = await res.json();
    const features = data.features || [];

    const earthquakes = features.map((f: UsgsFeature) => {
      const coords = f.geometry?.coordinates || [0, 0, 0];
      const props = f.properties;
      return {
        id: f.id,
        lat: coords[1],
        lng: coords[0],
        depth: coords[2],
        magnitude: props?.mag || 0,
        place: props?.place || 'Unknown',
        time: props?.time || 0,
        url: props?.url || '',
        tsunami: props?.tsunami || 0,
        type: props?.type || 'earthquake',
        felt: props?.felt || null,
        alert: props?.alert || null,
      };
    });

    return NextResponse.json({
      earthquakes,
      total: earthquakes.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Earthquake fetch error:', error);
    return NextResponse.json({ earthquakes: [], error: 'Failed to fetch earthquake data' }, { status: 500 });
  }
}

