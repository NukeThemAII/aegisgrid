# Scanner V2 local service

AegisGrid's public Next.js route at `/api/scanner` remains a guarded proxy. Scanner V2 now has a private localhost HTTP runner plus a pure policy core under `src/server/scanner-v2/`.

Current status:

- Policy core: `src/server/scanner-v2/scanner-service.ts`
- Private HTTP runner: `src/server/scanner-v2/http-runner.ts`
- Passive adapters: `src/server/scanner-v2/passive-adapters.ts`
- Tests: `src/server/scanner-v2/*.test.ts`
- Public Next.js route wiring remains guarded by `SCANNER_URL` + `SCANNER_KEY`.
- Active scanner adapters are intentionally not implemented or wired.

## Run locally

Configure `.env.local` or the process environment:

```env
SCANNER_KEY=change-me
SCANNER_URL=http://127.0.0.1:4007
SCANNER_ALLOWED_TARGETS=example.com,*.example.com
SCANNER_REQUIRE_VERIFICATION=true
SCANNER_V2_HOST=127.0.0.1
SCANNER_V2_PORT=4007
SCANNER_V2_ALLOW_NON_LOOPBACK=false
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

1. Require the local scanner shared key to be configured.
2. Require the incoming key to match before target validation or adapter dispatch.
3. Reject unknown scan types such as `deep`, `banner`, `ports`, or arbitrary ranges.
4. Validate host/IP targets with the shared SSRF guard before adapters run.
5. Allow passive modules for public targets without allowlist membership.
6. Allow `vuln` CVE/CPE evidence strings without host DNS validation because they are not network targets.
7. Require allowlist / ownership verification before any active module adapter runs.
8. Return normalized `source_unavailable` placeholders for passive modules without adapters.
9. Return HTTP 501 for active modules without adapters.
10. Convert adapter failures into normalized HTTP 502 errors.

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

They return HTTP 501 unless explicit adapters are injected in a future slice. Do not wire them until auth, entitlement, ownership verification, audit logging, and rate/concurrency controls exist end-to-end.

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
npm run lint
npm run typecheck
npm run build
```
