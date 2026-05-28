import { NextResponse } from 'next/server';

const fetchedAt = () => new Date().toISOString();

/**
 * AEGISGRID — Balloons / Radiosonde Route
 *
 * STATUS: PERMANENT PLACEHOLDER — no lawful free API exists.
 *
 * Radiosonde (weather balloon) tracking data is not available as a
 * free, lawful JSON API. NOAA upper-air sounding data is distributed
 * as HTML/CSV files, not a real-time API. Community radiosonde
 * tracking projects exist but their licensing, reliability, and
 * terms of service have not been verified for automated ingestion.
 *
 * This route intentionally returns empty data rather than fake
 * telemetry. When a verified lawful source becomes available, an
 * adapter will be implemented following the Safecast radiation
 * adapter pattern (src/lib/adapters/safecast.ts).
 *
 * Decision: Keep placeholder. Do NOT remove the layer toggle as
 * the MapLibre map references 'balloons' as a GeoJSON source and
 * removing it would break the map component.
 */
export async function GET() {
  const now = fetchedAt();

  return NextResponse.json(
    {
      status: 'source_unavailable',
      message:
        'Balloon/radiosonde tracking is not available. No free, lawful JSON API exists for real-time radiosonde data. NOAA data is HTML/CSV only. This route will remain a placeholder until a verified source adapter is implemented.',
      balloons: [],
      featureCollection: {
        type: 'FeatureCollection',
        features: [],
      },
      source: {
        source: 'AegisGrid placeholder',
        source_url: null,
        fetched_at: now,
        license: 'TBD — no lawful source identified',
        attribution:
          'Placeholder — no free real-time radiosonde API available. See docs/sources.md.',
        confidence: 'low',
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}
