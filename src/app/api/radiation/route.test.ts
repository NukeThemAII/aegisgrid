import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Sample Safecast API response ────────────────────────────────────

const mockSafecastMeasurements = [
  {
    id: 179862029,
    user_id: 952,
    value: 39.0,
    unit: 'cpm',
    location_name: 'Bergen Station',
    device_id: null,
    measurement_import_id: 51468,
    captured_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago → 'recent'
    height: null,
    devicetype_id: null,
    sensor_id: null,
    station_id: 101,
    channel_id: null,
    latitude: 60.353865,
    longitude: 5.358143,
  },
  {
    id: 179862030,
    user_id: 952,
    value: 31.0,
    unit: 'cpm',
    location_name: null,
    device_id: null,
    measurement_import_id: 51468,
    captured_at: new Date(Date.now() - 3 * 86400000).toISOString(), // 3d ago → 'stale'
    height: null,
    devicetype_id: null,
    sensor_id: null,
    station_id: 202,
    channel_id: null,
    latitude: 60.3544,
    longitude: 5.35828,
  },
  {
    id: 179862031,
    user_id: 952,
    value: 45.0,
    unit: 'cpm',
    location_name: null,
    device_id: null,
    measurement_import_id: 51468,
    captured_at: new Date(Date.now() - 10 * 86400000).toISOString(), // 10d ago → 'archived'
    height: null,
    devicetype_id: null,
    sensor_id: null,
    station_id: null,
    channel_id: null,
    latitude: 35.6762,
    longitude: 139.6503,
  },
];

describe('/api/radiation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized stations from Safecast with proper status classification', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSafecastMeasurements,
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.stations).toHaveLength(3);
    expect(body.source.source).toBe('Safecast');
    expect(body.source.license).toContain('CC0');
    expect(body.source.confidence).toBe('medium');

    // Verify station normalization
    const s0 = body.stations[0];
    expect(s0).toMatchObject({
      lat: 60.353865,
      lng: 5.358143,
      name: 'Bergen Station',
      reading: 39.0,
      unit: 'cpm',
      status: 'recent',
      network: 'Safecast',
    });
    expect(s0.city).toBeNull();
    expect(s0.country).toBeNull();

    // Station with location_name=null → uses station_id
    const s1 = body.stations[1];
    expect(s1.name).toBe('Station 202');
    expect(s1.status).toBe('stale');

    // Station with no location_name and no station_id → uses measurement id
    const s2 = body.stations[2];
    expect(s2.name).toBe('Measurement 179862031');
    expect(s2.status).toBe('archived');
  });

  it('builds a valid GeoJSON FeatureCollection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSafecastMeasurements,
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(body.featureCollection.type).toBe('FeatureCollection');
    expect(body.featureCollection.features).toHaveLength(3);

    const f0 = body.featureCollection.features[0];
    expect(f0.type).toBe('Feature');
    expect(f0.geometry).toEqual({
      type: 'Point',
      coordinates: [5.358143, 60.353865],
    });
    expect(f0.properties.name).toBe('Bergen Station');
    expect(f0.properties.reading).toBe(39.0);
    expect(f0.properties.status).toBe('recent');
    expect(f0.properties.network).toBe('Safecast');
  });

  it('returns source_degraded when Safecast is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200); // graceful: 200 even on upstream failure
    expect(body.status).toBe('source_degraded');
    expect(body.stations).toEqual([]);
    expect(body.featureCollection).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
    expect(body.source.source).toBe('Safecast');
  });

  it('returns source_degraded when Safecast returns non-200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('source_degraded');
    expect(body.stations).toEqual([]);
  });

  it('returns source_degraded when Safecast returns non-array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'unexpected' }),
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('source_degraded');
    expect(body.stations).toEqual([]);
  });

  it('includes Cache-Control header with appropriate TTL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSafecastMeasurements,
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();

    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('max-age=300');
    expect(cc).toContain('stale-while-revalidate');
  });

  it('never leaks API response internals in JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSafecastMeasurements,
    } as Response);

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();
    const json = JSON.stringify(body);

    // No raw Safecast keys leaked
    expect(json).not.toContain('user_id');
    expect(json).not.toContain('measurement_import_id');
    expect(json).not.toContain('devicetype_id');
    expect(json).not.toContain('sensor_id');
  });
});
