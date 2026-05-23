import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressInfo } from 'node:net';
import {
  createScannerHttpServer,
  parseRunnerConfig,
  type ScannerHttpServer,
} from './http-runner';
import type { ScannerService } from './scanner-service';

const openServers: ScannerHttpServer[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(server => server.close()));
});

function fakeService(): ScannerService {
  return {
    scan: vi.fn(),
    handleUrl: vi.fn(async url => {
      const parsed = new URL(String(url));
      return {
        status: 200,
        body: {
          ok: true,
          path: parsed.pathname,
          target: parsed.searchParams.get('target'),
          key_seen: parsed.searchParams.has('key'),
        },
      };
    }),
  };
}

async function startFakeServer(service = fakeService()) {
  const server = createScannerHttpServer({ service });
  await server.listen({ host: '127.0.0.1', port: 0 });
  openServers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP address');
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  return { server, service, baseUrl };
}

describe('parseRunnerConfig', () => {
  it('defaults to localhost-only runner settings', () => {
    const config = parseRunnerConfig({ SCANNER_KEY: 'secret' });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4007);
    expect(config.serviceKey).toBe('secret');
    expect(config.requireVerification).toBe(true);
    expect(config.allowlist).toEqual([]);
  });

  it('parses explicit port, allowlist, and verification settings', () => {
    const config = parseRunnerConfig({
      SCANNER_KEY: 'secret',
      SCANNER_V2_PORT: '4010',
      SCANNER_ALLOWED_TARGETS: 'example.com,*.example.org',
      SCANNER_REQUIRE_VERIFICATION: 'false',
    });

    expect(config.port).toBe(4010);
    expect(config.allowlist).toEqual(['example.com', '*.example.org']);
    expect(config.requireVerification).toBe(false);
  });

  it('rejects non-loopback binding unless explicitly allowed', () => {
    expect(() => parseRunnerConfig({ SCANNER_KEY: 'secret', SCANNER_V2_HOST: '0.0.0.0' })).toThrow(
      /refusing non-loopback/i,
    );
  });

  it('allows non-loopback binding only behind an explicit escape hatch', () => {
    const config = parseRunnerConfig({
      SCANNER_KEY: 'secret',
      SCANNER_V2_HOST: '0.0.0.0',
      SCANNER_V2_ALLOW_NON_LOOPBACK: 'true',
    });

    expect(config.host).toBe('0.0.0.0');
  });

  it('also refuses non-loopback listen calls on the exported server helper by default', async () => {
    const server = createScannerHttpServer({ service: fakeService() });

    await expect(server.listen({ host: '0.0.0.0', port: 0 })).rejects.toThrow(/refusing non-loopback/i);
  });
});

describe('scanner HTTP runner', () => {
  it('serves a no-store health response without requiring a scanner key', async () => {
    const { baseUrl } = await startFakeServer();

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(body.ok).toBe(true);
    expect(body.service).toBe('aegisgrid-scanner-v2');
    expect(body.active_adapters_enabled).toBe(false);
  });

  it('delegates /scan/:type requests to the scanner service without logging or rewriting query params', async () => {
    const { baseUrl, service } = await startFakeServer();

    const res = await fetch(`${baseUrl}/scan/rdns?key=secret&target=example.net`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, path: '/scan/rdns', target: 'example.net', key_seen: true });
    expect(service.handleUrl).toHaveBeenCalledOnce();
  });

  it('rejects unsupported methods before scanner service dispatch', async () => {
    const { baseUrl, service } = await startFakeServer();

    const res = await fetch(`${baseUrl}/scan/rdns?key=secret&target=example.net`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(405);
    expect(body.error).toBe('method not allowed');
    expect(service.handleUrl).not.toHaveBeenCalled();
  });

  it('returns 404 for non-scan routes', async () => {
    const { baseUrl, service } = await startFakeServer();

    const res = await fetch(`${baseUrl}/scan`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('not found');
    expect(service.handleUrl).not.toHaveBeenCalled();
  });

  it('converts unexpected scanner service errors into 502 responses', async () => {
    const service: ScannerService = {
      scan: vi.fn(),
      handleUrl: vi.fn(async () => {
        throw new Error('adapter panic');
      }),
    };
    const { baseUrl } = await startFakeServer(service);

    const res = await fetch(`${baseUrl}/scan/rdns?key=secret&target=example.net`);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('scanner service failed');
    expect(body.detail).toBe('adapter panic');
  });
});
