# AegisGrid Development Log

> Maintained locally. Push to GitHub when the owner reviews and approves.

---

## 2026-05-28 (session 7) — OAuth Layer Implementation

### Task: NextAuth (Auth.js v5) Integration
- **Installed `next-auth@beta`**: Integrated the modern App Router-compatible Auth.js v5.
- **Configured Providers**: Setup `GitHub` and `Google` OAuth providers in `src/auth.ts`.
- **API Routes**: Configured the catch-all `[...nextauth]` route handler.
- **UI Integration**: Added a Server Component `<AuthButton />` positioned in the top-right command center of `layout.tsx` to handle `signIn` and `signOut` Server Actions.
- **Quality Gates**: `npm run build` passes with full Next.js 16/React 19 compatibility.

---

## 2026-05-28 (session 6) — Type Tightening (API Routes)

### Task: Eliminate `any` types in critical backend routes

- **OSINT Routes (24 instances of `any` removed):**
  - Fully typed all 8 OSINT routes (`whois`, `ip`, `dns`, `bgp`, `cve`, `threats`, etc.).
  - Added strict interfaces for external APIs (RDAP, Google DNS, MITRE CVE 5.0, OTX Pulses, BGPView).
  - Strongly typed all return structures (`WhoisResult`, `DnsResult`, `ThreatsResult`, etc.).
- **Feed/Geo Routes (Remaining route `any` types eliminated):**
  - Typed `earthquakes`, `news`, `region-dossier`, `cctv` routes.
  - Replaced massive `any` arrays with proper `Camera` and `RssItem` interfaces.
- **Tests (4 instances removed):**
  - Tightened types in `osint/dns/route.test.ts` and `osint/sweep/route.test.ts` to `Record<string, unknown>` and targeted objects.

**Current State:** 
- All backend routes are now strictly typed.
- Remaining `any` usage is isolated solely to frontend React components (`src/components/` and `page.tsx`).
- **Quality gates:** lint ✅ | 553 tests / 54 files ✅ | build ✅

---

## 2026-05-28 (session 5) — OSINT Route Tests (Part 2 — completion)

### Task: remaining 4 OSINT routes test coverage (31 tests added)

| Route | Tests | Coverage |
|-------|-------|----------|
| `/api/osint/certs` | 6 | Domain validation, CT log deduplication, wildcard stripping, subdomain extraction, crt.sh unavailability, network errors. |
| `/api/osint/cve` | 9 | CVE format validation, MITRE CVE 5.0 parsing (CVSS, CWE, affected products, references), CIRCL fallback, dual-source failure, severity derivation. |
| `/api/osint/threats` | 5 | OTX pulse fetching (auth fallback to activity), IP Tor exit list check, OTX reputation, domain WHOIS, threat level calculation. |
| `/api/osint/sweep` | 11 | IPv4 validation, 8 private/reserved range tests, CIDR range validation, geo error handling, full sweep with device classification + risk assessment, network errors. |

Also fixed: `prefer-const` lint warning in `/api/osint/bgp` test from previous session.

**Quality gates:** lint ✅ (zero warnings) | typecheck ✅ | 553 tests / 54 files ✅ | build ✅

### Gaps closed
- ~~OSINT route tests~~ → **ALL 8 ROUTES TESTED** (IP, DNS, BGP, WHOIS, certs, CVE, threats, sweep)
- Test count: 522 → **553** (+31)
- Test files: 50 → **54** (+4)

---

## 2026-05-28 (session 4) — OSINT Route Tests (Part 1)

### Task: OSINT routes test coverage (20 tests added)

| Route | Tests | Coverage |
|-------|-------|----------|
| `/api/osint/ip` | 6 | Format validation (v4/v6), octet range checks, successful geolocation mapping, reputation calculation, upstream error handling. |
| `/api/osint/dns` | 4 | Domain validation, proper aggregation of multiple record types (A, AAAA, MX, NS, TXT, CNAME, SOA), upstream timeout handling. |
| `/api/osint/bgp` | 6 | Validation, IP-to-ASN lookup, ASN prefix/peers lookup mapping, proper mock isolation. |
| `/api/osint/whois` | 4 | Domain validation, RDAP aggregation (events, entities, nameservers), HTTP header security grading (HSTS, CSP, etc.), combined upstream error swallowing. |

**Quality gates:** lint ✅ | typecheck ✅ | 522 tests / 50 files ✅ | build ✅

### Gaps closed
- OSINT route tests (4 out of 8 completed)
- Test count: 502 → **522** (+20)
- Test files: 46 → **50** (+4)

---

## 2026-05-28 (session 3) — Zod Environment Validation

### Task: env.ts + env.test.ts (30 tests added)

| Component | Coverage |
|-----------|----------|
| `envSchema` | Zod schema for all 54+ environment variables across App, DB, Redis, Auth, Features, AI, Scanner, Stripe, x402, Optional APIs. |
| `parseEnv` | Caching, overriding for tests, validation errors formatting. |
| Derived helpers | `isProduction`, `isDatabaseConfigured`, `isRedisConfigured`, `isStripeFullyConfigured`, `isX402Configured`, `isScannerProxyConfigured`, `aiProviderName`. |
| Tests | 30 tests covering defaults, booleans, enums, cache invalidation. |

**Quality gates:** lint ✅ | typecheck ✅ | 502 tests / 46 files ✅ | build ✅

### Gaps closed
- ~~No `env.ts` — centralized environment validation missing~~ → **DONE**
- ~~Zod not even installed~~ → **Installed**
- Test count: 472 → **502** (+30)
- Test files: 45 → **46** (+1)

---

## 2026-05-28 (session 2) — ssrf-guard Test Coverage

### Task: ssrf-guard.test.ts (55 tests added)

| Group | Tests | Coverage |
|-------|-------|----------|
| `parseIPv4` | 9 | Canonical forms, octal/hex/decimal bypass attempts, IPv6 rejection |
| `validateHost — IPv4` | 17 | All 14 RFC blocked ranges, boundary cases, canonical form enforcement |
| `validateHost — IPv6` | 9 | Loopback, unspecified, mapped, unique-local, link-local, doc, multicast, bracketed |
| `validateHost — hostnames` | 8 | localhost, docker.internal, .local, .internal, syntax validation, DNS resolution |
| `isRateLimited` | 6 | Window behavior, reset, per-IP tracking, custom windows |
| `getClientIp` | 6 | x-forwarded-for, x-real-ip, fallbacks, whitespace trimming |

**Quality gates:** lint ✅ | typecheck ✅ | 472 tests / 45 files ✅ | build ✅

### Gaps closed
- ~~No tests for ssrf-guard.ts~~ → **55 tests covering all exported functions**
- Test count: 417 → **472** (+55)
- Test files: 44 → **45** (+1)

---

## 2026-05-28 — Codebase Audit + Security Hardening Pass

### Audit Score: **8.5 / 10**

**What's solid (score drivers):**
- Lint: zero warnings ✅
- Typecheck: clean ✅
- Build: 46 routes, successful production build on Next.js 16.2.6 Turbopack ✅
- Tests: 417 tests across 44 files, all passing ✅
- Rebrand: zero Osiris references remaining in source ✅
- SSRF guard: comprehensive IPv4/IPv6/DNS rebinding protection ✅
- XSS mitigation: html tagged template with escape-by-default ✅
- No hardcoded secrets in production code ✅
- No simulated/fake data in production output ✅
- robots.txt, sitemap.xml, favicons, OG image all present ✅
- Feature flags, scanner policy, audit logging all well-structured ✅
- AI provider abstraction (deterministic/OpenAI/Hermes) with prompt-injection controls ✅
- Stripe + x402 billing foundations with fail-closed guards ✅
- Postgres schema + repository pattern ✅

**What was fixed in this session:**

#### 1. Security headers added to proxy.ts (AGENTS.md §15)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- `X-DNS-Prefetch-Control: off`
- `Strict-Transport-Security` (skipped on localhost)
- CSP intentionally deferred (MapLibre, YouTube, HLS, fonts, Vercel Analytics)
- Note: Next.js 16 uses `proxy.ts` not `middleware.ts`; headers merged into existing proxy

#### 2. Health endpoint modernized
- Version synced to `0.1.0` (was hardcoded `1.0.0`)
- All 47 API routes listed, grouped into 8 categories
- Added `Cache-Control: no-cache, no-store`

#### 3. OSINT route security hardening
- **IP route**: IPv6 regex tightened (was `[0-9a-fA-F:]+`, now requires colons and proper structure)
- **IP route**: IPv4 octet validation added (rejects > 255)
- **IP route**: `encodeURIComponent` added to ip-api.com URL path
- **Sweep route**: `encodeURIComponent` added to ip-api.com URL path
- **BGP route**: `encodeURIComponent` added to bgpview.io URL path
- **BGP route**: IPv4 octet range validation added
- Added documentation comments about ip-api.com HTTP-only free tier

### Files changed (5)
| File | Change |
|------|--------|
| `src/proxy.ts` | Security headers + rate limit restructured |
| `src/app/api/health/route.ts` | Complete rewrite with full route catalog |
| `src/app/api/osint/ip/route.ts` | Input validation tightened |
| `src/app/api/osint/sweep/route.ts` | URL encoding fix |
| `src/app/api/osint/bgp/route.ts` | URL encoding + validation fix |

### Quality gates after changes
- `npm run lint` ✅
- `npx tsc --noEmit` ✅
- `npx vitest run` — 417 tests, 44 files, all passing ✅
- `npm run build` — 46 routes, successful ✅

---

### Known gaps (not fixed yet, prioritized for future sessions)

| Priority | Gap | AGENTS.md ref |
|----------|-----|---------------|
| **HIGH** | No Content-Security-Policy (needs careful CSP audit for MapLibre/HLS/YouTube/fonts) | §15 |
| **HIGH** | No zod validation on API routes (regex-only validation) | §7, §18 |
| **HIGH** | No tests for ssrf-guard.ts (most security-critical module) | §19 |
| **HIGH** | No tests for OSINT routes (/api/osint/*) | §19 |
| **MEDIUM** | Feed routes (earthquakes, fires, news) have no per-route rate limiting | §15 |
| **MEDIUM** | Pervasive `any` types in OSINT routes and OsintPanel.tsx | §6 |
| **MEDIUM** | No centralized env.ts with zod validation | §6 |
| **MEDIUM** | Scanner response from external backend passed through without sanitization | §11 |
| **MEDIUM** | No CSRF protection for state-changing routes | §15 |
| **LOW** | Component directory is flat (spec wants map/panels/billing/reports/ui subdirs) | §6 |
| **LOW** | No `pino` structured logging | §7 |
| **LOW** | Two duplicate docker-compose files (.yaml + .yml) | cleanup |
| **LOW** | OsintPanel.tsx is 825-line monolith | refactor |

### Roadmap status (unchanged from README.md)
```
Completed foundations (20+ items) — see README.md §Roadmap
Up next:
- [ ] OAuth layer (GitHub/Google)
- [ ] Redis job queue + background feed workers
- [ ] Lawful radiosonde (balloons) source adapter
- [ ] Radiation monitoring adapter
- [ ] Expanded AIS maritime tracking
- [ ] Type tightening + unit test coverage expansion
- [ ] Comms/collaboration features
- [ ] CSP policy implementation
- [ ] Zod validation layer
- [ ] ssrf-guard test coverage
```
