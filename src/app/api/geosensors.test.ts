import { describe, expect, it, vi, afterEach } from 'vitest';

describe('placeholder geosensor routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps balloons normalized and explicitly unavailable', async () => {
    const { GET } = await import('./balloons/route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'source_unavailable', balloons: [] });
    expect(body.featureCollection).toEqual({ type: 'FeatureCollection', features: [] });
    expect(body.source.confidence).toBe('low');
  });

  it('radiation route now uses Safecast adapter with live fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          value: 50,
          unit: 'cpm',
          location_name: 'Test Station',
          captured_at: new Date().toISOString(),
          latitude: 35.0,
          longitude: 139.0,
          user_id: null,
          device_id: null,
          measurement_import_id: null,
          height: null,
          devicetype_id: null,
          sensor_id: null,
          station_id: 1,
          channel_id: null,
        },
      ],
    } as unknown as Response);

    const { GET } = await import('./radiation/route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.stations).toHaveLength(1);
    expect(body.stations[0]).toMatchObject({
      lat: 35.0,
      lng: 139.0,
      name: 'Test Station',
      reading: 50,
      unit: 'cpm',
      network: 'Safecast',
    });
    expect(body.source.source).toBe('Safecast');
    expect(body.source.confidence).toBe('medium');
  });
});
