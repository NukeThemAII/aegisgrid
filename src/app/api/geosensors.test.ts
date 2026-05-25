import { describe, expect, it } from 'vitest';

describe('placeholder geosensor routes', () => {
  it('keeps balloons normalized and explicitly unavailable', async () => {
    const { GET } = await import('./balloons/route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'source_unavailable', balloons: [] });
    expect(body.featureCollection).toEqual({ type: 'FeatureCollection', features: [] });
    expect(body.source.confidence).toBe('low');
  });

  it('keeps radiation normalized and explicitly unavailable', async () => {
    const { GET } = await import('./radiation/route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'source_unavailable', stations: [] });
    expect(body.featureCollection).toEqual({ type: 'FeatureCollection', features: [] });
    expect(body.source.confidence).toBe('low');
  });
});
