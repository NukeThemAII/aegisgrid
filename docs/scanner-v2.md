# Scanner V2 local service skeleton

AegisGrid's public Next.js route at `/api/scanner` remains a guarded proxy. The Scanner V2 work starts in `src/server/scanner-v2/` as a local-service policy core that can be wrapped by a private localhost or Docker-network HTTP server later.

Current status:

- Implemented: `src/server/scanner-v2/scanner-service.ts`
- Tests: `src/server/scanner-v2/scanner-service.test.ts`
- Public Next.js route wiring: deferred; `/api/scanner` still requires `SCANNER_URL` and `SCANNER_KEY` and keeps its existing allowlist gate.
- Real scanner adapters: deferred. No port scanning or active network probing is implemented in this skeleton.

## Policy model

The local service accepts the same endpoint shape the proxy expects:

```txt
GET /scan/:type?key=<SCANNER_KEY>&target=<host-or-ip>
```

The pure service exposes `handleUrl()` for this shape and `scan()` for tests/adapters.

Execution order is fail-closed:

1. Require the local scanner shared key to be configured.
2. Require the incoming key to match before target validation or adapter dispatch.
3. Reject unknown scan types such as `deep`, `banner`, `ports`, or arbitrary ranges.
4. Validate the target with the shared SSRF guard before any adapter runs.
5. Allow passive modules for public targets without allowlist membership.
6. Require allowlist / ownership verification before any active module adapter runs.
7. Return normalized `source_unavailable` placeholders for passive modules without adapters.
8. Return HTTP 501 for active modules without adapters.
9. Convert adapter failures into normalized HTTP 502 errors.

## Scan classification

Passive modules currently classified as public-data / no direct target probing:

- `rdns`
- `whois`
- `subdomains`
- `geoloc`
- `vuln` (passive CVE correlation only; no exploit execution)

Active modules currently classified as target-contacting and therefore verification-gated:

- `quick`
- `ssl`
- `headers`
- `tech`

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
npm test -- src/server/scanner-v2/scanner-service.test.ts
npm run lint
npm run typecheck
npm run build
```
