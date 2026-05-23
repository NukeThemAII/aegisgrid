import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseAllowlist, parseRequireVerification } from '../../lib/scanner-scope';
import { createScannerService, SCAN_DEFINITIONS, type ScannerService } from './scanner-service';
import { createPassiveAdapters } from './passive-adapters';

export interface ScannerRunnerConfig {
  host: string;
  port: number;
  serviceKey: string;
  allowlist: readonly string[];
  requireVerification: boolean;
  allowNonLoopback: boolean;
}

export interface ScannerHttpServer {
  listen(options: { host: string; port: number }): Promise<void>;
  close(): Promise<void>;
  address(): ReturnType<Server['address']>;
}

export interface ScannerHttpServerOptions {
  service?: ScannerService;
  activeAdaptersEnabled?: boolean;
  allowNonLoopback?: boolean;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4007;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parsePort(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid SCANNER_V2_PORT: ${raw}`);
  }
  return port;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized);
}

export function parseRunnerConfig(env: Record<string, string | undefined>): ScannerRunnerConfig {
  const host = env.SCANNER_V2_HOST?.trim() || DEFAULT_HOST;
  const allowNonLoopback = env.SCANNER_V2_ALLOW_NON_LOOPBACK === 'true';

  if (!isLoopbackHost(host) && !allowNonLoopback) {
    throw new Error(
      `Refusing non-loopback scanner bind host "${host}". Set SCANNER_V2_ALLOW_NON_LOOPBACK=true only for a private network you control.`,
    );
  }

  return {
    host,
    port: parsePort(env.SCANNER_V2_PORT),
    serviceKey: env.SCANNER_KEY || '',
    allowlist: parseAllowlist(env.SCANNER_ALLOWED_TARGETS || ''),
    requireVerification: parseRequireVerification(env.SCANNER_REQUIRE_VERIFICATION),
    allowNonLoopback,
  };
}

function jsonResponse(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

function getRequestUrl(req: IncomingMessage): URL | null {
  const rawUrl = req.url || '/';
  if (rawUrl.length > 2048) return null;
  try {
    return new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return null;
  }
}

export function createScannerHttpServer(options: ScannerHttpServerOptions = {}): ScannerHttpServer {
  const service = options.service ?? createScannerService({ serviceKey: '' });
  const activeAdaptersEnabled = options.activeAdaptersEnabled ?? false;
  const allowNonLoopback = options.allowNonLoopback ?? false;

  const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      jsonResponse(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    const url = getRequestUrl(req);
    if (!url) {
      jsonResponse(res, 400, { ok: false, error: 'invalid request url' });
      return;
    }

    if (url.pathname === '/health') {
      jsonResponse(res, 200, {
        ok: true,
        service: 'aegisgrid-scanner-v2',
        passive_scans: Object.entries(SCAN_DEFINITIONS)
          .filter(([, definition]) => definition.mode === 'passive')
          .map(([scanType]) => scanType),
        active_adapters_enabled: activeAdaptersEnabled,
      });
      return;
    }

    if (!url.pathname.startsWith('/scan/')) {
      jsonResponse(res, 404, { ok: false, error: 'not found' });
      return;
    }

    try {
      const scanResult = await service.handleUrl(url);
      jsonResponse(res, scanResult.status, scanResult.body);
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'scanner service failed',
        detail: error instanceof Error ? error.message : 'unknown scanner service error',
      });
    }
  });

  return {
    listen({ host, port }) {
      if (!isLoopbackHost(host) && !allowNonLoopback) {
        return Promise.reject(
          new Error(`Refusing non-loopback scanner bind host "${host}". Set allowNonLoopback only for a private network you control.`),
        );
      }

      return new Promise((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    address() {
      return server.address();
    },
  };
}

export async function startScannerHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<ScannerHttpServer> {
  const config = parseRunnerConfig(env);
  const service = createScannerService({
    serviceKey: config.serviceKey,
    allowlist: config.allowlist,
    requireVerification: config.requireVerification,
    adapters: createPassiveAdapters(),
  });
  const server = createScannerHttpServer({
    service,
    activeAdaptersEnabled: false,
    allowNonLoopback: config.allowNonLoopback,
  });
  await server.listen({ host: config.host, port: config.port });
  return server;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isMainModule()) {
  startScannerHttpServer()
    .then(server => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        console.log(`[AEGISGRID] Scanner V2 listening on http://${address.address}:${address.port}`);
      } else {
        console.log('[AEGISGRID] Scanner V2 listening');
      }
    })
    .catch(error => {
      console.error('[AEGISGRID] Scanner V2 failed to start:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
