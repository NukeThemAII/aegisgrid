import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AISSTREAM_API_KEY;
});

function mockRequest(ip: string = '127.0.0.1'): Request {
  return {
    headers: new Headers({ 'x-forwarded-for': ip }),
  } as Request;
}

describe('/api/maritime', () => {
  it('includes AIS readiness metadata without fake live vessels when no key is configured', async () => {
    vi.resetModules();
    delete process.env.AISSTREAM_API_KEY;
    const { GET } = await import('./route');

    const res = await GET(mockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ports.length).toBeGreaterThan(0);
    expect(body.chokepoints.length).toBeGreaterThan(0);
    expect(body.ais).toMatchObject({ status: 'api_key_missing', vessels: [] });
    expect(body.source.source).toBe('AegisGrid maritime static registry');
  });

  it('marks AISStream as configured but not connected in the serverless route', async () => {
    vi.resetModules();
    process.env.AISSTREAM_API_KEY = 'ais-secret';
    const { GET } = await import('./route');

    const res = await GET(mockRequest());
    const body = await res.json();

    expect(body.ais).toMatchObject({ status: 'configured_not_connected', vessels: [] });
    expect(JSON.stringify(body)).not.toContain('ais-secret');
  });
});
