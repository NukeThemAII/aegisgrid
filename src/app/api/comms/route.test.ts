import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FEATURE_COMMS;
});

describe('/api/comms', () => {
  it('fails safe with an empty registry while the comms feature is disabled', async () => {
    vi.resetModules();
    process.env.FEATURE_COMMS = 'false';
    const { GET } = await import('./route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('disabled');
    expect(body.sources).toEqual([]);
    expect(body.source.attribution).toContain('feature flag');
  });

  it('returns only lawful public comms metadata when enabled', async () => {
    vi.resetModules();
    process.env.FEATURE_COMMS = 'true';
    const { GET } = await import('./route');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.sources.length).toBeGreaterThan(0);
    for (const source of body.sources) {
      expect(typeof source.embed_allowed).toBe('boolean');
      expect(source.terms_note).toBeTruthy();
      expect(source.category).not.toBe('police_tactical');
    }
  });
});
