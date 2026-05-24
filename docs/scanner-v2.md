# Scanner V2 local service

AegisGrid's public Next.js route at `/api/scanner` now has dual-path routing:

1. **Passive scans** (rdns, whois, subdomains, geoloc, vuln) run Scanner V2 adapters **in-process** — no external backend required.
2. **Active scans** (quick, ssl, headers, tech) still proxy to an external scanner backend via `SCANNER_URL` + `SCANNER_KEY`, and require explicit target allowlisting in the public route. They fail closed otherwise.

Current status:

- Policy core: `src/server/scanner-v2/scanner-service.ts`
- Private HTTP runner: `src/server/scanner-v2/http-runner.ts`
- Passive adapters: `src/server/scanner-v2/passive-adapters.ts`
- Route policy helpers: `src/lib/scanner-policy.ts`
- Audit logging: `src/lib/scanner-audit.ts`
- Tests: `src/server/scanner-v2/*.test.ts`, `src/lib/scanner-policy.test.ts`
- Public Next.js route: `src/app/api/scanner/route.ts`
- Source health endpoint: `src/app/api/scanner/health/route.ts`
- Active scanner adapters are intentionally not implemented or wired.

## Run locally

### Passive lookups only (no backend needed)

Passive scan types work out-of-the-box without any scanner backend. Just start the Next.js dev server:

```bash
npm run dev
# Then: curl 'http://localhost:3000/api/scanner?type=rdns&target=example.com'
```

### Full setup with active scans

Configure `.env.local` or the process environment:

```env
SCANNER_KEY=change-me
SCANNER_URL=http://127.0.0.1:4007
SCANNER_ALLOWED_TARGETS=example.com,*.example.com
SCANNER_REQUIRE_VERIFICATION=true
SCANNER_V2_HOST=127.0.0.1
SCANNER_V2_PORT=4007
SCANNER_V2_ALLOW_NON_LOOPBACK=false
SCANNER_AUDIT_PERSISTENCE=file
SCANNER_AUDIT_LOG_PATH=.data/scanner-audit.jsonl
```

Start the private runner:

```bash
npm run scanner:v2
```

Default binding is `127.0.0.1:4007`. The runner refuses non-loopback bind hosts unless `SCANNER_V2_ALLOW_NON_LOOPBACK=true` is set. Only use that escape hatch on a private network you control.

Health check:

```bash
curl http://127.0.0.1:4007/health
```

Scan shape:

```txt
GET /scan/:type?key=<SCANNER_KEY>&target=<host-or-ip-or-passive-evidence>
```

Do not log URLs containing the `key` query parameter in production process managers.

## Policy model

Execution order is fail-closed:

1. Rate-limit by client IP (5 requests/minute).
2. Validate scan type against the authoritative `SCAN_DEFINITIONS` registry.
3. Classify scan as passive or active.
4. **Passive path**: validate host/IP targets with the SSRF guard, then run the in-process adapter. Only the `vuln` module may accept CVE/CPE evidence strings without host validation.
5. **Active path**: require explicit `SCANNER_ALLOWED_TARGETS` match AND `SCANNER_URL`/`SCANNER_KEY` configuration. If either is missing, fail closed with a clear JSON error. The public route does not use `SCANNER_REQUIRE_VERIFICATION=false` to open active scans.
6. Return normalized empty results for passive modules without adapters.
7. Return HTTP 501 for active modules without adapters.
8. Convert adapter failures into normalized HTTP 502 errors.
9. All decisions are audit-logged.

## Audit logging

Every scanner request is logged via `src/lib/scanner-audit.ts` as structured JSON to `console.info`.

Log fields:
- `timestamp` — ISO 8601
- `scan_type` — requested scan module
- `target_classification` — ipv4/ipv6/domain/cve/cpe/unknown
- `sanitized_target` — truncated, control-char-stripped target
- `mode` — passive/active/unknown
- `decision` — allowed/denied
- `denial_reason` — machine-readable code when denied
- `result_status` — HTTP status returned
- `duration_ms` — wall-clock duration
- `client_ip` — forwarded client IP
- `entitlement` — `public_passive`, `target_allowlisted_active`, `denied`, or `unknown`

**Security**: SCANNER_KEY and auth headers are never logged. The `ScanAuditEntry` type does not accept secret fields.

Lightweight persistence is configured with:

| Env var | Default | Behavior |
| --- | --- | --- |
| `SCANNER_AUDIT_PERSISTENCE` | `file` | `file` appends JSONL and logs to console; `console` logs only; `off` disables audit emission. |
| `SCANNER_AUDIT_LOG_PATH` | `.data/scanner-audit.jsonl` | Local JSONL path for VPS/self-hosted deployments. Parent directories are created automatically. |

Persistence is best-effort: a file write failure emits a warning but does not make scanner responses fail.

Log prefix: `[AEGIS-AUDIT]` for easy filtering:

```bash
grep '\[AEGIS-AUDIT\]' /var/log/aegisgrid.log | jq .
```

## Source health endpoint

The public health endpoint is:

```txt
GET /api/scanner/health
```

It returns a no-store JSON payload with registered passive source adapters, source names and fixed source URLs where applicable, active scan requirements, and audit persistence mode. It does not expose API keys or raw secrets.

The health endpoint intentionally does not live-probe upstream sources by default; it reports local adapter registration and source configuration so health checks stay fast and avoid unnecessary third-party traffic.

## Passive adapters implemented

These adapters use only DNS or fixed public data-source endpoints. They do not probe target services.

| Scan | Source | Behavior |
| --- | --- | --- |
| `rdns` | Node DNS resolver | IP reverse lookup; hostname A/AAAA lookup then reverse each IP; per-record errors captured |
| `whois` | `https://rdap.org` | RDAP domain/IP lookup with normalized handle/status/events |
| `subdomains` | `https://crt.sh` | CT JSON lookup for domains only; deduplicates, strips wildcards, filters to requested domain, bounds results |
| `geoloc` | `http://ip-api.com` free endpoint | IP geolocation; hostnames resolve to public IPs first; source errors captured |
| `vuln` | `https://cveawg.mitre.org` | CVE ID lookup only; CPE strings recorded for future NVD correlation; ordinary hostnames return `not_applicable` |

All fetches use fixed base URLs, `AbortSignal.timeout`, bounded response sizes, and normalized output metadata.

## Active adapters disabled

Active modules remain classified but unwired:

- `quick`
- `ssl`
- `headers`
- `tech`

They return a clear JSON error with code `ACTIVE_SCAN_REQUIRES_VERIFICATION` (if target not allowlisted) or `SCANNER_BACKEND_NOT_CONFIGURED` (if backend not set up). Do not wire them until auth, entitlement, ownership verification, audit logging, and rate/concurrency controls exist end-to-end.

## Safety constraints

Do not add these to Scanner V2:

- exploit modules
- brute force or credential checks
- stealth scanning
- arbitrary port ranges
- unrestricted banner grabbing
- public unauthenticated active scanning

Active adapters must only be wired after ownership verification or explicit admin allowlist enforcement exists at both the proxy and local-service layers.

## Verification

Run:

```bash
npm test -- src/server/scanner-v2
npm test -- src/lib/scanner-policy
npm run lint
npm run typecheck
npm run build
```
