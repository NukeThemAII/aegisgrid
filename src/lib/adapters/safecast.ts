/**
 * AEGISGRID — Safecast Radiation Monitoring Adapter
 *
 * Fetches radiation measurements from the Safecast API (CC0 public domain).
 * https://api.safecast.org/
 *
 * No API key required. Data may be days/weeks old — NOT real-time.
 */

import { logger } from '@/lib/logging';

export interface SourceMeta {
  source: string;
  source_url: string | null;
  fetched_at: string;
  license?: string;
  attribution?: string;
  confidence?: 'low' | 'medium' | 'high';
}

interface SafecastMeasurement {
  id: number;
  user_id: number | null;
  value: number;
  unit: string;
  location_name: string | null;
  device_id: number | null;
  measurement_import_id: number | null;
  captured_at: string;
  height: number | null;
  devicetype_id: number | null;
  sensor_id: number | null;
  station_id: number | null;
  channel_id: number | null;
  latitude: number;
  longitude: number;
}

export interface NormalizedRadiationStation {
  id: number;
  lat: number;
  lng: number;
  name: string;
  reading: number;
  unit: string;
  capturedAt: string;
  status: 'recent' | 'stale' | 'archived';
  network: 'Safecast';
}

export interface SafecastResponse {
  stations: NormalizedRadiationStation[];
  total: number;
  source: SourceMeta;
}

const SAFECAST_API = 'https://api.safecast.org/measurements.json';
const SAFECAST_SOURCE_URL = 'https://api.safecast.org/';
const SAFECAST_LICENSE = 'CC0-1.0 (public domain dedication)';
const SAFECAST_ATTRIBUTION = 'Safecast (https://safecast.org)';

const FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function ageStatus(capturedAt: string): NormalizedRadiationStation['status'] {
  const age = Date.now() - new Date(capturedAt).getTime();
  if (age < FRESH_THRESHOLD_MS) return 'recent';
  if (age < STALE_THRESHOLD_MS) return 'stale';
  return 'archived';
}

function stationName(m: SafecastMeasurement): string {
  if (m.location_name) return m.location_name;
  if (m.station_id) return `Station ${m.station_id}`;
  return `Measurement ${m.id}`;
}

export async function fetchRadiationStations(limit: number = 200): Promise<SafecastResponse> {
  const fetchedAt = new Date().toISOString();
  const source: SourceMeta = {
    source: 'Safecast',
    source_url: SAFECAST_SOURCE_URL,
    fetched_at: fetchedAt,
    license: SAFECAST_LICENSE,
    attribution: SAFECAST_ATTRIBUTION,
    confidence: 'medium',
  };

  try {
    const url = `${SAFECAST_API}?per_page=${limit}&order=captured_at+desc`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return { stations: [], total: 0, source };

    const raw: SafecastMeasurement[] = await res.json();
    if (!Array.isArray(raw)) return { stations: [], total: 0, source };

    const stations: NormalizedRadiationStation[] = raw.map((m) => ({
      id: m.id,
      lat: m.latitude,
      lng: m.longitude,
      name: stationName(m),
      reading: m.value,
      unit: m.unit || 'cpm',
      capturedAt: m.captured_at,
      status: ageStatus(m.captured_at),
      network: 'Safecast',
    }));

    return { stations, total: stations.length, source };
  } catch (error) {
    logger.error({ err: error }, 'Safecast fetch error');
    return { stations: [], total: 0, source };
  }
}
