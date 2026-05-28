# AegisGrid Task Backlog

> Priority-ordered work items. Top item is the current focus.
> Mark completed items with `[x]` and note the commit SHA.

---

## HIGH — Security & Production Readiness

### 1. [x] Premium frontend panel (Stripe + x402 + AI Reports UI)
**Why:** Backend has full billing/payment infrastructure but zero frontend UI.
Users can't see or access premium features.
**Scope:** Create PremiumPanel component showing auth status, Pro subscription
(Stripe checkout/portal), AI report generation, x402 pay-per-use info.
Wire into desktop sidebar.
**Estimate:** ~1.5h.
**Done:** commit `fc36f78` — PremiumPanel.tsx created and wired into page.tsx.

### 1. [x] Feed route per-route rate limiting
**Done:** commit `b42beff` — 17 routes rate-limited, 16 new tests.

### 1. [x] Fix OsintPanel recon toolkit — wire CVE to OSINT route, auth UX
**Done:** commit `ef2422e` — CVE tab uses /api/osint/cve, friendly auth error messages.

### 2. [x] Scanner response sanitization
**Why:** MEDIUM gap. Scanner proxy responses from external backend pass through
without field allowlisting. An attacker-controllable scanner backend could
inject unexpected fields into the public API response.
**Scope:** Add response shape validation + field allowlisting in
`src/app/api/scanner/route.ts`. Tests for field stripping.
**Estimate:** ~1h.
**Done:** commit `b8852fe` — sanitizeScannerResponse with top-level allowlist, depth enforcement, 5 tests.

### 3. [ ] CSRF protection for state-changing routes
**Why:** MEDIUM gap. Routes like `/api/billing/checkout`, `/api/billing/portal`,
`/api/reports`, `/api/scanner/verification` are POST endpoints without CSRF
tokens. Current mitigations: CORS preflight (JSON content-type), auth tokens.
**Scope:** Add origin/referer checking middleware or CSRF token pattern. Tests.
**Estimate:** ~2h.

### 4. [ ] Balloons placeholder — source adapter or layer removal
**Why:** Last remaining `source_unavailable` route. Lawful free radiosonde
APIs are nearly nonexistent (NOAA upper-air data is HTML/CSV not JSON API).
**Scope:** Research viable source, implement adapter, OR document decision
to keep placeholder with clear rationale.
**Estimate:** ~1h (research + document) or ~3h (implement if source found).

---

## MEDIUM — Feature Expansion

### 5. [ ] Redis job queue + background feed workers
**Why:** README roadmap. Feed refresh currently happens on-demand per request;
background workers would cache feeds, reduce upstream API load, and improve
response times.
**Scope:** BullMQ queue setup, worker process, feed cache population.
Requires Redis. Add to platform/status readiness reporting.
**Estimate:** ~4h.

### 6. [ ] Expanded AIS maritime tracking
**Why:** README roadmap. Static ports/chokepoints exist; live AIS via
aisstream.io would add real-time vessel tracking.
**Scope:** AISStream WebSocket worker (separate process), vessel cache,
rate limiting, license compliance.
**Estimate:** ~4h.

### 7. [ ] Comms/collaboration features
**Why:** README roadmap. Vague scope — needs decomposition before coding.
**Scope:** TBD. Likely real-time alerts, shared views, annotations.
**Estimate:** Unknown — spike first.

---

## LOW — Code Quality & Maintenance

### 8. [ ] Component directory reorganization
**Why:** LOW gap. Components are flat in `src/components/`. AGENTS.md §6
specifies `map/`, `panels/`, `billing/`, `reports/`, `ui/` subdirectories.
**Scope:** Move files, update imports. Tests must still pass.
**Estimate:** ~0.5h.

### 9. [ ] Remove duplicate docker-compose files
**Why:** LOW gap. Both `docker-compose.yml` and `docker-compose.yaml` exist.
**Scope:** Verify they're identical, remove one, update docs if needed.
**Estimate:** ~0.25h.

### 10. [ ] pino structured logging
**Why:** LOW gap. AGENTS.md §7 recommends pino. Currently using console.log/error.
**Scope:** Add pino, create logger singleton, replace console.* calls.
**Estimate:** ~1h.

### 11. [ ] OsintPanel.tsx refactor (825-line monolith)
**Why:** LOW gap. Single 825-line component with 8+ tabs.
**Scope:** Split into per-tab components under `src/components/panels/osint/`.
**Estimate:** ~2h.

### 12. [ ] AUDIT.md Rec #2 — CSP nonces
**Why:** Valid hardening. Current CSP uses `style-src 'self' 'unsafe-inline'`.
Nonces would allow tightening.
**Scope:** Per-request nonce generation in middleware, injected into CSP header
and HTML. Complex in Next.js 16 App Router.
**Estimate:** ~3h.

### 13. [ ] AUDIT.md Rec #3 — Database audit trails (immutable ledger)
**Why:** Valid hardening. Credit ledger rows should be append-only.
**Scope:** Prisma migration to add constraint/trigger, or app-level guard.
**Estimate:** ~1.5h.

---

## Completed

- [x] Rebrand to AegisGrid (commit: early sessions)
- [x] SSRF guard + tests (commit: `1e9270c`)
- [x] Security hardening pass (commit: `9b057d9`)
- [x] Scanner V2 passive runner + auth boundary (commits: `b5a902c`, `7eefaaa`)
- [x] Platform auth/billing/report foundations (commits: `d2788d9`, `93c3fce`)
- [x] Postgres schema + Prisma (commit: `66daf36`)
- [x] Redis cache seam (commit: `2ff37ad`)
- [x] Stripe billing (commit: `ad36b4d`)
- [x] x402 USDC payments (commits: `8ffe986`, `f0614ea`)
- [x] AI report providers (commit: `1a87c0f`)
- [x] Comms registry foundation (commit: `fdd3b92`)
- [x] Deployment scaffolding (commit: `30ffe6c`)
- [x] Zod env validation (commit: `5d4907c`)
- [x] OSINT route test coverage (commits: `0800029`, `9867909`)
- [x] Type tightening — backend routes (commit: `253d0c4`)
- [x] OAuth layer (commit: `cf300ac`)
- [x] CSP security headers (commit: `d799a61`)
- [x] Radiation adapter — Safecast (commit: `b88124b`)
- [x] SSRF host-pinning — DNS rebinding (commit: `581592f`)

---

*Last updated: 2026-05-28 (session 10)*
