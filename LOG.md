# AegisGrid Development Log

> Maintained locally. Push to GitHub when the owner reviews and approves.

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
