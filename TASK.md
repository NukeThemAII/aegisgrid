# AegisGrid Task Backlog

> Priority-ordered work items.
> Completed items show commit SHA.

---

## HIGH — Completed

- [x] **Feed route rate limiting** — `b42beff` — 17 routes rate-limited, 16 tests
- [x] **Premium frontend panel** — `fc36f78` — Stripe/x402/AI Reports in sidebar
- [x] **OsintPanel fixes** — `ef2422e` — CVE tab → OSINT route, auth error UX
- [x] **Scanner response sanitization** — `b8852fe` — field allowlisting, depth enforcement, 5 tests
- [x] **Premium status endpoint + config-aware UI** — `64ff477` — /api/premium/status, setup guide
- [x] **CSRF protection** — `99837b8` — proxy-level Origin/Referer validation, 17 tests
- [x] **SSRF host-pinning** — `581592f` — DNS rebinding mitigation via undici Agent
- [x] **CSP fix (MapLibre globe)** — `2c155de` — worker-src blob: added
- [x] **Radiation adapter (Safecast)** — `b88124b` — CC0 public API, 7 tests

## HIGH — Remaining

### Balloons placeholder
**Why:** Last `source_unavailable` route. No free radiosonde JSON API exists
(NOAA upper-air data is HTML/CSV, radiosonde tracking is niche).
**Action:** Document as intentionally placeholder with rationale. Remove layer toggle
from UI until a lawful source is found.
**Estimate:** ~0.5h.

### Redis job queue + background feed workers
**Why:** Feeds refresh on-demand per request. Background workers would cache feeds,
reduce upstream API load, and improve response times.
**Requires:** Redis (REDIS_URL), BullMQ setup.
**Estimate:** ~4h.

## MEDIUM

- [ ] Expanded AIS maritime tracking (aisstream.io WebSocket worker)
- [ ] Comms/collaboration features (needs decomposition first)
- [ ] Component directory reorganization (map/panels/billing/reports/ui)
- [ ] Remove duplicate docker-compose files

## LOW

- [ ] pino structured logging
- [ ] OsintPanel.tsx refactor (825-line monolith)
- [ ] AUDIT.md Rec #2 — CSP nonces
- [ ] AUDIT.md Rec #3 — Database audit trails (immutable ledger)

## Credentials needed from operator

| Feature | Variables |
|---|---|
| Stripe Pro | STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTHLY |
| x402 USDC | X402_RECEIVING_ADDRESS, X402_FACILITATOR_URL |
| AI (OpenAI) | OPENAI_API_KEY |
| Auth (OAuth) | AUTH_GITHUB_ID, AUTH_GITHUB_SECRET |
| Auth (tokens) | AUTH_USER_TOKENS (subject:token pairs), AUTH_ADMIN_TOKEN |
| Database | DATABASE_URL (Postgres) |
| Redis | REDIS_URL |

---

*Last updated: 2026-05-28*
