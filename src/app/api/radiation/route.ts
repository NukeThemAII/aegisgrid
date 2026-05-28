/**
 * AEGISGRID — Radiation Monitoring API
 *
 * Aggregates radiation measurements from the Safecast public API
 * (CC0 public domain). Returns normalized station data with GeoJSON.
 * No API key required. No fake data — if Safecast is unreachable,
 * returns an empty dataset with source metadata.
 */

import { NextResponse } from 'next/server';
import {
  fetchRadiationStations,
  type NormalizedRadiationStation,
  type SourceMeta,
} from '@/lib/adapters/safecast';

// ── GeoJSON types ───────────────────────────────────────────────────

interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

// ── Frontend-facing station shape ───────────────────────────────────

interface FrontendStation {
  lat: number;
  lng: number;
  name: string;
  city: string | null;
  country: string | null;
  reading: number;
  unit: string;
  status: string;
  network: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function toGeoJsonFeature(s: NormalizedRadiationStation): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [s.lng, s.lat],
    },
    properties: {
      id: s.id,
      name: s.name,
      reading: s.reading,
      unit: s.unit,
      capturedAt: s.capturedAt,
      status: s.status,
      network: s.network,
    },
  };
}

function toFrontendStation(s: NormalizedRadiationStation): FrontendStation {
  return {
    lat: s.lat,
    lng: s.lng,
    name: s.name,
    city: null,   // Safecast does not provide city-level geo
    country: null, // Safecast does not provide country-level geo
    reading: s.reading,
    unit: s.unit,
    status: s.status,
    network: s.network,
  };
}

// ── Route handler ───────────────────────────────────────────────────

export async function GET() {
  const result = await fetchRadiationStations(200);

  const stations: FrontendStation[] = result.stations.map(toFrontendStation);

  const features: GeoJsonFeature[] = result.stations.map(toGeoJsonFeature);
  const featureCollection: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  const source: SourceMeta = result.source;

  const active = stations.length > 0;

  return NextResponse.json(
    {
      status: active ? 'ok' : 'source_degraded',
      message: active
        ? `Safecast: ${stations.length} measurements available.`
        : 'Safecast API returned no measurements; data may be empty or unreachable.',
      stations,
      featureCollection,
      source,
    },
    {
      status: 200,
      headers: {
        // Safecast data is historical; cache for 5 minutes
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    },
  );
}
