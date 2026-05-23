/**
 * Passive scanner adapters for Scanner V2.
 *
 * Each adapter is a `ScanAdapter` — an async function taking a target string
 * and returning `Record<string, unknown>`.
 *
 * Safety invariants:
 *  - All network calls use AbortSignal.timeout and fixed base URLs.
 *  - No exploit code, no credential checks, no active probing.
 *  - Output is bounded (max items / max bytes).
 *  - Unknown JSON is isolated with type guards.
 */

import { lookup, reverse } from 'node:dns/promises';
import type { ScanAdapter, ScanType } from './scanner-service';

// ────────────────────────────────────────────────────────────────────────────
// Shared constants
// ────────────────────────────────────────────────────────────────────────────

/** Default network timeout for all adapter fetches (ms). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** Default DNS timeout to avoid hanging on resolver issues (ms). */
const DNS_TIMEOUT_MS = 5_000;

/** Maximum number of items to return from list-based adapters. */
const MAX_RESULTS = 200;

/** ip-api free tier has tight request limits; cap hostname fan-out aggressively. */
const MAX_GEOLOC_IPS = 5;

/** Maximum response body bytes before truncation (512 KiB). */
const MAX_RESPONSE_BYTES = 512 * 1024;

// ────────────────────────────────────────────────────────────────────────────
// Type guards / helpers
// ────────────────────────────────────────────────────────────────────────────

/** Returns true when `value` looks like an IPv4 or IPv6 address (best-effort). */
function isIpLiteral(value: string): boolean {
  // IPv4: dotted decimal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  // IPv6: contains at least two colons
  if (value.includes(':')) return true;
  return false;
}

/** Safely check whether an unknown value is a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Safely read a string field from an unknown record. */
function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function lookupWithTimeout(hostname: string) {
  return withTimeout(lookup(hostname, { all: true }), DNS_TIMEOUT_MS, 'DNS lookup');
}

async function reverseWithTimeout(ip: string) {
  return withTimeout(reverse(ip), DNS_TIMEOUT_MS, 'DNS reverse lookup');
}

/** Bounded fetch: aborts after timeout, rejects bodies exceeding MAX_RESPONSE_BYTES. */
async function boundedFetch(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  // Check content-length before reading body when available.
  const cl = res.headers.get('content-length');
  if (cl && Number(cl) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response body too large (${cl} bytes)`);
  }
  return res;
}

/** Read response text while enforcing MAX_RESPONSE_BYTES even when content-length is absent. */
async function readBoundedText(res: Response): Promise<string> {
  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response body too large (${contentLength} bytes)`);
  }

  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response body too large (>${MAX_RESPONSE_BYTES} bytes)`);
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response body too large (>${MAX_RESPONSE_BYTES} bytes)`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

/** Read JSON from a bounded fetch, returning null on non-OK or parse failure. */
async function boundedFetchJson(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const res = await boundedFetch(url, timeoutMs);
  if (!res.ok) return null;
  const text = await readBoundedText(res);
  return JSON.parse(text) as unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. RDNS adapter
// ────────────────────────────────────────────────────────────────────────────

export interface RdnsResult {
  target: string;
  is_ip: boolean;
  forward_ips: string[];
  reverse_records: Array<{ ip: string; hostnames: string[]; error?: string }>;
  status: string;
  source: string;
  fetched_at: string;
}

export async function rdnsAdapter(target: string): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const isIp = isIpLiteral(target);

  const forwardIps: string[] = [];
  const reverseRecords: RdnsResult['reverse_records'] = [];

  if (isIp) {
    // Reverse lookup directly on the IP.
    try {
      const hostnames = await reverseWithTimeout(target);
      reverseRecords.push({ ip: target, hostnames: hostnames.slice(0, MAX_RESULTS) });
    } catch (err) {
      reverseRecords.push({
        ip: target,
        hostnames: [],
        error: err instanceof Error ? err.message : 'reverse lookup failed',
      });
    }
  } else {
    // Forward resolve → then reverse each IP.
    try {
      const addresses = await lookupWithTimeout(target);
      for (const addr of addresses.slice(0, MAX_RESULTS)) {
        forwardIps.push(addr.address);
        try {
          const hostnames = await reverseWithTimeout(addr.address);
          reverseRecords.push({ ip: addr.address, hostnames: hostnames.slice(0, MAX_RESULTS) });
        } catch (err) {
          reverseRecords.push({
            ip: addr.address,
            hostnames: [],
            error: err instanceof Error ? err.message : 'reverse lookup failed',
          });
        }
      }
    } catch (err) {
      return {
        target,
        is_ip: isIp,
        forward_ips: [],
        reverse_records: [],
        status: 'lookup_failed',
        error: err instanceof Error ? err.message : 'forward lookup failed',
        source: 'node:dns',
        fetched_at: fetchedAt,
      };
    }
  }

  return {
    target,
    is_ip: isIp,
    forward_ips: forwardIps,
    reverse_records: reverseRecords,
    status: 'ok',
    source: 'node:dns',
    fetched_at: fetchedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. RDAP / WHOIS adapter
// ────────────────────────────────────────────────────────────────────────────

/** Fixed public RDAP bootstrap endpoint. */
const RDAP_DOMAIN_BASE = 'https://rdap.org/domain/';
const RDAP_IP_BASE = 'https://rdap.org/ip/';

export async function rdapAdapter(target: string): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const isIp = isIpLiteral(target);
  const url = isIp ? `${RDAP_IP_BASE}${encodeURIComponent(target)}` : `${RDAP_DOMAIN_BASE}${encodeURIComponent(target)}`;

  let status = 'ok';
  let data: Record<string, unknown> = {};

  try {
    const raw = await boundedFetchJson(url);

    if (raw === null) {
      status = 'not_found';
    } else if (isRecord(raw)) {
      // Normalize key fields.
      data = {
        name: stringField(raw, 'name') ?? stringField(raw, 'ldhName'),
        handle: stringField(raw, 'handle'),
        type: stringField(raw, 'objectClassName'),
        rdap_status: Array.isArray(raw.status) ? (raw.status as unknown[]).filter(s => typeof s === 'string').slice(0, 20) : [],
        events: Array.isArray(raw.events) ? (raw.events as unknown[]).filter(isRecord).map(e => ({
          action: stringField(e, 'eventAction'),
          date: stringField(e, 'eventDate'),
        })).slice(0, 20) : [],
        port43: stringField(raw, 'port43'),
      };
    } else {
      status = 'unexpected_response';
    }
  } catch (err) {
    status = 'error';
    data = { error: err instanceof Error ? err.message : 'rdap fetch failed' };
  }

  return {
    target,
    endpoint_type: isIp ? 'ip' : 'domain',
    status,
    source: 'rdap.org',
    source_url: url,
    fetched_at: fetchedAt,
    ...data,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. CT subdomains adapter
// ────────────────────────────────────────────────────────────────────────────

/** Fixed CT log source. */
const CRT_SH_BASE = 'https://crt.sh/';

export async function ctSubdomainsAdapter(target: string): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();

  // Only query for domain names, not IPs.
  if (isIpLiteral(target)) {
    return {
      target,
      status: 'skipped',
      reason: 'CT log queries require a domain name, not an IP address',
      subdomains: [],
      source: 'crt.sh',
      fetched_at: fetchedAt,
    };
  }

  const domain = target.toLowerCase();
  const url = `${CRT_SH_BASE}?q=${encodeURIComponent(`%.${domain}`)}&output=json`;

  let subdomains: string[] = [];

  try {
    const raw = await boundedFetchJson(url);

    if (!Array.isArray(raw)) {
      return {
        target,
        status: raw === null ? 'not_found' : 'unexpected_response',
        subdomains: [],
        source: 'crt.sh',
        source_url: url,
        fetched_at: fetchedAt,
      };
    }

    // Extract and deduplicate common_name / name_value fields.
    const seen = new Set<string>();
    for (const entry of raw as unknown[]) {
      if (!isRecord(entry)) continue;
      // name_value may contain newline-separated names.
      const nameValue = stringField(entry, 'name_value') ?? '';
      const commonName = stringField(entry, 'common_name') ?? '';
      for (const raw_name of [...nameValue.split('\n'), commonName]) {
        let name = raw_name.trim().toLowerCase();
        if (!name) continue;
        // Strip wildcard prefix.
        if (name.startsWith('*.')) name = name.slice(2);
        // Only keep names that are under the requested domain.
        if (name === domain || name.endsWith(`.${domain}`)) {
          seen.add(name);
        }
      }
      if (seen.size >= MAX_RESULTS) break;
    }

    subdomains = [...seen].sort().slice(0, MAX_RESULTS);
  } catch (err) {
    return {
      target,
      status: 'error',
      error: err instanceof Error ? err.message : 'ct fetch failed',
      subdomains: [],
      source: 'crt.sh',
      source_url: url,
      fetched_at: fetchedAt,
    };
  }

  return {
    target,
    status: 'ok',
    count: subdomains.length,
    subdomains,
    source: 'crt.sh',
    source_url: url,
    fetched_at: fetchedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Geolocation adapter
// ────────────────────────────────────────────────────────────────────────────

/** Free geolocation endpoint (upstream free tier is HTTP-only, not HTTPS). */
const GEOLOC_BASE = 'http://ip-api.com/json/';

interface GeolocEntry {
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
  as_number?: string;
  status: string;
  error?: string;
}

export async function geolocAdapter(target: string): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  const isIp = isIpLiteral(target);

  // Resolve IPs for hostnames first.
  let ips: string[];
  if (isIp) {
    ips = [target];
  } else {
    try {
      const addresses = await lookupWithTimeout(target);
      ips = addresses.map(a => a.address).slice(0, MAX_GEOLOC_IPS);
    } catch (err) {
      return {
        target,
        status: 'lookup_failed',
        error: err instanceof Error ? err.message : 'hostname resolution failed',
        results: [],
        source: 'ip-api.com',
        fetched_at: fetchedAt,
      };
    }
    if (ips.length === 0) {
      return {
        target,
        status: 'no_addresses',
        results: [],
        source: 'ip-api.com',
        fetched_at: fetchedAt,
      };
    }
  }

  const results: GeolocEntry[] = [];
  for (const ip of ips) {
    const url = `${GEOLOC_BASE}${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,lat,lon,isp,org,as`;
    try {
      const raw = await boundedFetchJson(url);
      if (isRecord(raw) && stringField(raw, 'status') === 'success') {
        results.push({
          ip,
          country: stringField(raw, 'country'),
          region: stringField(raw, 'regionName'),
          city: stringField(raw, 'city'),
          lat: typeof raw.lat === 'number' ? raw.lat : undefined,
          lon: typeof raw.lon === 'number' ? raw.lon : undefined,
          isp: stringField(raw, 'isp'),
          org: stringField(raw, 'org'),
          as_number: stringField(raw, 'as'),
          status: 'ok',
        });
      } else {
        results.push({
          ip,
          status: 'failed',
          error: isRecord(raw) ? stringField(raw, 'message') ?? 'geolocation failed' : 'unexpected response',
        });
      }
    } catch (err) {
      results.push({
        ip,
        status: 'error',
        error: err instanceof Error ? err.message : 'geoloc fetch failed',
      });
    }
  }

  return {
    target,
    is_ip: isIp,
    status: results.some(r => r.status === 'ok') ? 'ok' : 'failed',
    results,
    source: 'ip-api.com',
    source_url: `${GEOLOC_BASE}<ip>`,
    fetched_at: fetchedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Passive CVE correlation adapter
// ────────────────────────────────────────────────────────────────────────────

/** Fixed CVE / CPE source. */
const CVE_MITRE_BASE = 'https://cveawg.mitre.org/api/cve/';

/** Return true if the target is a valid CVE ID. */
function isCveId(target: string): boolean {
  return /^CVE-\d{4}-\d{4,}$/i.test(target);
}

/** Return true if the target looks like a CPE URI/string. */
function isCpe(target: string): boolean {
  return /^cpe:/i.test(target);
}

/** Return true if the target looks like supported passive vuln evidence. */
function isCveOrCpe(target: string): boolean {
  return isCveId(target) || isCpe(target);
}

export async function vulnAdapter(target: string): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();

  // Only handle CVE/CPE-like target strings passively.
  if (!isCveOrCpe(target)) {
    return {
      target,
      status: 'not_applicable',
      reason:
        'Passive CVE correlation requires a CVE ID (e.g. CVE-2024-1234) or CPE string (e.g. cpe:2.3:a:vendor:product:version). ' +
        'Ordinary hostnames cannot be correlated without active probing, which is disabled.',
      vulnerabilities: [],
      source: 'cveawg.mitre.org',
      fetched_at: fetchedAt,
    };
  }

  const upper = target.toUpperCase();

  // For CVE IDs, fetch directly.
  if (isCveId(target)) {
    const url = `${CVE_MITRE_BASE}${encodeURIComponent(upper)}`;
    try {
      const raw = await boundedFetchJson(url);

      if (raw === null) {
        return {
          target: upper,
          status: 'not_found',
          vulnerabilities: [],
          source: 'cveawg.mitre.org',
          source_url: url,
          fetched_at: fetchedAt,
        };
      }

      if (isRecord(raw)) {
        // Extract key CVE fields safely.
        const cveMetadata = isRecord(raw.cveMetadata) ? raw.cveMetadata : {};
        const containers = isRecord(raw.containers) ? raw.containers : {};
        const cna = isRecord(containers.cna) ? containers.cna : {};

        const descriptions = Array.isArray(cna.descriptions)
          ? (cna.descriptions as unknown[])
              .filter(isRecord)
              .map(d => ({
                lang: stringField(d, 'lang'),
                value: stringField(d, 'value'),
              }))
              .slice(0, 10)
          : [];

        return {
          target: upper,
          status: 'ok',
          cve_id: stringField(cveMetadata, 'cveId') ?? upper,
          state: stringField(cveMetadata, 'state'),
          descriptions,
          source: 'cveawg.mitre.org',
          source_url: url,
          fetched_at: fetchedAt,
        };
      }

      return {
        target: upper,
        status: 'unexpected_response',
        vulnerabilities: [],
        source: 'cveawg.mitre.org',
        source_url: url,
        fetched_at: fetchedAt,
      };
    } catch (err) {
      return {
        target: upper,
        status: 'error',
        error: err instanceof Error ? err.message : 'cve fetch failed',
        vulnerabilities: [],
        source: 'cveawg.mitre.org',
        source_url: url,
        fetched_at: fetchedAt,
      };
    }
  }

  // CPE strings: return explanatory status — no active correlation without probing.
  return {
    target,
    status: 'cpe_noted',
    reason:
      'CPE string recorded. Full CPE-to-CVE correlation via NVD API is planned but not yet implemented. ' +
      'No active probing or exploit fetching is performed.',
    vulnerabilities: [],
    source: 'cveawg.mitre.org',
    fetched_at: fetchedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Default passive adapter map
// ────────────────────────────────────────────────────────────────────────────

/** Only passive adapters. Active adapters (quick, ssl, headers, tech) are NOT included. */
export function createPassiveAdapters(): Partial<Record<ScanType, ScanAdapter>> {
  return {
    rdns: rdnsAdapter,
    whois: rdapAdapter,
    subdomains: ctSubdomainsAdapter,
    geoloc: geolocAdapter,
    vuln: vulnAdapter,
  };
}

/** Passive scan type keys. */
export const PASSIVE_ADAPTER_KEYS = ['rdns', 'whois', 'subdomains', 'geoloc', 'vuln'] as const;
