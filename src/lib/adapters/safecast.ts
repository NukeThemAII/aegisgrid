/**
 * AEGISGRID — Safecast Radiation Monitoring Adapter
 *
 * Fetches radiation measurements from the Safecast API (CC0 public domain).
 * https://api.safecast.org/
 *
 * The Safecast API returns CPM (counts per minute) readings from community
 * and professional radiation monitoring devices. No API key is required.
 *
 * IMPORTANT: Safecast data may be days/weeks old. This is NOT real-time
 * radiation monitoring — treat as historical reference only.
 */

export interface SourceMeta {
  source: string;
  source_url: string | null;
  fetched_at: string;
  license?: string;
  attribution?: string;
  confidence?: 'low' | 'medium' | 'high';
}

// ── Safecast API types ──────────────────────────────────────────────

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

// ── Normalized output types ─────────────────────────────────────────

export interface NormalizedRadiationStation {
  /** Safecast measurement ID */
  id: number;
  lat: number;
  lng: number;
  /** Human-readable label; falls back to measurement ID */
  name: string;
  /** Radiation reading in CPM */
  reading: number;
  /** Unit of measurement (typically 'cpm') */
  unit: string;
  /** UTC timestamp of the measurement */
  capturedAt: string;
  /** Age category for display purposes */
  status: 'recent' | 'stale' | 'archived';
  /** Source network label */
  network: 'Safecast';
}

export interface SafecastResponse {
  stations: NormalizedRadiationStation[];
  total: number;
  source: SourceMeta;
}

// ── Constants ───────────────────────────────────────────────────────

const SAFECAST_API = 'https://api.safecast.org/measurements.json';
const SAFECAST_SOURCE_URL = 'https://api.safecast.org/';
const SAFECAST_LICENSE = 'CC0-1.0 (public domain dedication)';
const SAFECAST_ATTRIBUTION = 'Safecast (https://safecast.org)';

/** Measurements older than this are marked 'archived' */
const FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;      // 24 hours
const STALE_THRESHOLD_MS  = 7 * 24 * 60 * 60 * 1000;  // 7 days

// ── Helpers ─────────────────────────────────────────────────────────

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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fetch recent Safecast radiation measurements and normalize them.
 * Returns up to `limit` results ordered by most recent first.
 */
export async function fetchRadiationStations(
  limit: number = 200,
): Promise<SafecastResponse> {
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

    if (!res.ok) {
      return { stations: [], total: 0, source };
    }

    const raw: SafecastMeasurement[] = await res.json();

    if (!Array.isArray(raw)) {
      return { stations: [], total: 0, source };
    }

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
    console.error('[AEGISGRID] Safecast fetch error:', error);
    return { stations: [], total: 0, source };
  }
}
