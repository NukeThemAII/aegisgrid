```
     _    _____ ____ ___ ____   ____ ____  ___ ____
    / \  | ____/ ___|_ _/ ___| / ___|  _ \|_ _|  _ \
   / _ \ |  _|| |  _ | |\___ \| |  _| |_) || || | | |
  / ___ \| |__| |_| || | ___) | |_| |  _ < | || |_| |
 /_/   \_\_____\____|___|____/ \____|_| \_\___|____/
```

# AegisGrid 🛰️

**Global situational intelligence grid.**

A lawful OSINT and situational-awareness dashboard built on MapLibre GL,
pulling public feeds across geophysics, aviation, maritime, cyber,
markets, and news into a single GPU-rendered map view — with a guarded
scanner proxy for authorized recon workflows.

> ⚠️ This is **not** a hacking tool. See [Safety Model](#-safety-model).

---

## 📡 What it does

AegisGrid aggregates open-source intelligence into real-time map layers:

| Domain | Layers |
|---|---|
| 🌍 Geophysics | Earthquakes (USGS), fires (NASA FIRMS), severe weather (EONET), space weather (NOAA SWPC) |
| ✈️ Aviation | ADS-B flight tracking, satellite TLE orbits (CelesTrak/N2YO) |
| 🚢 Maritime | Static port/chokepoint data, optional AIS via aisstream.io |
| 🔒 Cyber OSINT | Passive DNS, RDAP/WHOIS, certificate transparency, MITRE CVE, OTX, Shodan InternetDB sweep |
| 📰 Intel feeds | GDELT global incidents, RSS news, curated live broadcaster streams |
| 📈 Markets | Public market/crypto quote endpoints |
| 🏗️ Infrastructure | Curated nuclear/critical infrastructure reference dataset |
| 🌐 Regional intel | Country risk scoring, region dossier/encyclopedia lookups |
| 📹 CCTV | Public transport/road cameras, curated webcam embeds |
| 🔬 Scanner | Passive lookups (rDNS, WHOIS, subdomains, geoloc, CVE) work without backend; active scans relay to external backend (see [docs/scanner-v2.md](docs/scanner-v2.md)) |
| 🎈 Balloons | Placeholder — returns empty until a lawful radiosonde source is reviewed |
| ☢️ Radiation | Placeholder — returns empty until Safecast/EU adapter is reviewed |

Placeholder routes return `{ status: "source_unavailable" }` — never fake data.

---

## 🛡️ Safety model

AegisGrid is a **defensive research and awareness** tool. The rules are simple:

### ✅ Allowed

- Passive public-data collection with source attribution
- DNS, RDAP, certificate transparency, public threat-intel, CVE lookups
- User-authorized scanning through a **separate** backend you own/control
- Link-outs or embeds only when source terms allow

### 🚫 Not allowed

- Exploit execution, malware, phishing, credential theft, brute force
- Unauthorized or unauthenticated deep/mass scanning
- Bypassing paywalls, CAPTCHAs, robots.txt, rate limits, or source ToS
- Fake telemetry presented as production truth

No exceptions. If a source adapter cannot be verified as lawful, the route
stays as an empty placeholder.

---

## ⚙️ Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Framer Motion, Lucide icons |
| Styling | Tailwind CSS 4 |
| Map engine | MapLibre GL (GPU-rendered via react-map-gl) |
| Media | HLS.js (live streams), sharp (image processing) |
| Data libs | rss-parser, satellite.js |
| Analytics | Vercel Analytics |
| Platform foundation | Token API auth, fail-closed billing guard, DB-backed entitlements/report persistence, deterministic report route, Postgres/Redis compose readiness |
| Language | TypeScript 5 |

---

## 🚀 Quick start

```bash
git clone https://github.com/NukeThemAII/aegisgrid.git
cd aegisgrid
npm install
cp .env.example .env.local   # edit as needed
npm run lint                  # must pass
npm run build                 # must pass
npm run dev                   # http://localhost:3000
```

Most public layers work **without API keys**. Optional keys (NASA FIRMS,
OpenSky, OTX, Shodan, etc.) are documented in `.env.example` and
`docs/sources.md`.

---

## 🏗️ Deploying on a VPS

### Option A — systemd (simplest, no Docker)

```bash
# On the VPS:
sudo useradd -r -s /bin/false aegisgrid
sudo -u aegisgrid git clone https://github.com/NukeThemAII/aegisgrid.git /home/xaos/aegisgrid
cd /home/xaos/aegisgrid
npm install
cp .env.example .env.local   # edit secrets
npm run build

# Install systemd unit:
sudo cp deploy/aegisgrid.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aegisgrid
```

### Option B — Docker Compose

```bash
docker compose up -d
docker compose logs -f aegisgrid
```

### Reverse proxy + TLS

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx-aegisgrid.conf /etc/nginx/sites-available/aegisgrid
sudo ln -s /etc/nginx/sites-available/aegisgrid /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get TLS cert (replace domain):
sudo certbot --nginx -d your-domain.example
```

See `deploy/README.md` for full VPS setup walkthrough.

---

## 🔑 Environment setup

Copy `.env.example` → `.env.local`. Key groups:

```
# ── Core ──────────────────────────────────────────
NEXT_PUBLIC_APP_NAME=AegisGrid
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/aegisgrid
DATABASE_POOL_MAX=5
REDIS_URL=redis://localhost:6379/0

# ── Auth / premium foundation ─────────────────────
AUTH_USER_TOKENS=        # subject-id:token pairs for API auth
AUTH_ADMIN_TOKEN=        # operator/admin bearer token
AUTH_USER_ENTITLEMENTS=  # subject-id:premium or subject-id:ai_report
AUTH_STATIC_ENTITLEMENTS_FALLBACK=false  # non-production DB-backed dev fallback only
AUTH_GITHUB_ID=          # OAuth planned
AUTH_GOOGLE_ID=          # OAuth planned

# ── Scanner proxy (guarded) ──────────────────────
SCANNER_URL=http://127.0.0.1:4007  # URL of your private scanner backend
SCANNER_KEY=             # backend shared secret
SCANNER_USER_TOKENS=     # subject-id:token pairs for active scanner users
SCANNER_ADMIN_TOKEN=     # bearer token for admin allowlist/audit endpoints
SCANNER_ALLOWED_TARGETS= # read-only admin allowlist baseline
SCANNER_VERIFIED_TARGETS= # read-only subject target baseline: subject-id:example.com
SCANNER_REQUIRE_VERIFICATION=true  # used by private runner; public route still requires auth + entitlement
SCANNER_VERIFICATION_SECRET=change-me
SCANNER_TARGETS_DIR=.data/scanner-targets
SCANNER_ADMIN_ALLOWLIST_PATH=.data/scanner-admin-allowlist.json
SCANNER_V2_HOST=127.0.0.1
SCANNER_V2_PORT=4007
SCANNER_AUDIT_PERSISTENCE=file
SCANNER_AUDIT_LOG_PATH=.data/scanner-audit.jsonl

# ── Stripe / x402 billing foundation ─────────────
STRIPE_SECRET_KEY=        STRIPE_WEBHOOK_SECRET=
STRIPE_LIVE_MODE=false    STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=  STRIPE_PRICE_REPORT_PACK=
STRIPE_REPORT_PACK_CREDITS=10
X402_ENABLED=false        X402_RECEIVING_ADDRESS=
X402_FACILITATOR_URL=     X402_NETWORK=eip155:8453
X402_REPORT_PRICE_USDC=1.00  X402_API_PRICE_USDC=0.05
CDP_API_KEY_ID=           CDP_API_KEY_SECRET=

# ── Optional enrichment API keys ─────────────────
NASA_FIRMS_MAP_KEY=      AISSTREAM_API_KEY=
OPENSKY_CLIENT_ID=       OPENSKY_CLIENT_SECRET=
VIRUSTOTAL_API_KEY=      ABUSEIPDB_API_KEY=
OTX_API_KEY=             URLSCAN_API_KEY=
CENSYS_API_ID=           CENSYS_API_SECRET=
GREYNOISE_API_KEY=       SHODAN_API_KEY=
N2YO_API_KEY=            IPCAMLIVE_API_SECRET=

# ── Feature flags / commercial readiness ──────────
FEATURE_AI_REPORTS=false
AI_PROVIDER=none         # deterministic | openai | hermes — see provider docs below
FEATURE_COMMS=false
FEATURE_PREMIUM=false
FEATURE_X402=false
X402_ENABLED=false
```

> 💡 Current foundation routes are intentionally conservative:
> `/api/auth/session`, `/api/platform/status`, `/api/reports`, `/api/x402/report`,
> `/api/x402/enrich`, `/api/x402/audit`, and `/api/comms` are wired with
> token auth where applicable, DB-backed entitlement/report/payment-event checks,
> fail-closed premium/x402 gates, sanitized readiness metadata,
> provider-abstracted report generation (deterministic/openai/hermes), official Stripe
> Checkout/Portal/Webhook foundations, optional Redis-backed shared cache helper
> with in-memory fallback, and official x402 `withX402` exact-EVM
> pay-per-report/pay-per-enrichment settlement. Full OAuth, Redis job queues,
> and background feed refresh workers remain planned follow-up work.

---

## 🤖 AI provider abstraction

AI report generation uses a provider factory pattern (`src/lib/ai/provider-factory.ts`).
Set `AI_PROVIDER` to select the backend:

| Value | Behavior | Requirements |
|---|---|---|
| `none` | Disabled (default, fail-closed) | — |
| `deterministic` | Local source-bounded reports, no external calls | — |
| `openai` | OpenAI chat completions API | `OPENAI_API_KEY` |
| `hermes` | Hermes-compatible chat API | `HERMES_API_KEY` + `HERMES_API_URL` |

### Prompt-injection controls

External providers (openai, hermes) use layered safety:

1. **System prompt**: Declares all source payloads as untrusted evidence that may not override instructions
2. **Source sanitization**: Strips HTML tags, control characters, limits length before embedding in prompts
3. **Citation validation**: Every citation in output must reference a provided source index
4. **Required fields**: Output must contain Executive Summary, Key Findings, Citations, Uncertainty
5. **Fail-closed**: If validation fails, returns structured error — never persists unvalidated AI output

### x402 reports

x402 paid reports (`/api/x402/report`) require `AI_PROVIDER=deterministic` for settlement safety —
deterministic output is reproducible and auditable, which is essential for pay-per-report semantics.

---

## 🗄️ Persistence and shared cache

The Postgres foundation is now wired for commercial state:

- schema: `db/schema.sql`
- client/repository: `src/lib/db/postgres.ts`, `src/lib/db/app-repository.ts`
- persisted tables: `users`, `entitlements`, `credit_ledger`, `payment_events`, `reports`
- report persistence seam: `src/lib/reports/report-store.ts`
- premium checks: `src/lib/billing/guard.ts`
- shared cache seam: `src/lib/cache/cache-store.ts` (`REDIS_URL` uses Redis via `ioredis`; unset env uses in-memory TTL fallback)

Apply the schema locally:

```bash
psql "$DATABASE_URL" -f db/schema.sql
# or with docker compose defaults:
docker compose exec -T postgres psql -U aegisgrid -d aegisgrid < db/schema.sql
```

Fail-closed behavior:

- When `DATABASE_URL` is configured, premium checks query active DB entitlements first.
- DB errors deny premium access instead of falling back to static env grants.
- Static `AUTH_USER_ENTITLEMENTS` are a dev fallback only when `DATABASE_URL` is unset, unless `AUTH_STATIC_ENTITLEMENTS_FALLBACK=true` and `NODE_ENV` is not `production`.
- `/api/reports` returns `500 REPORT_PERSISTENCE_FAILED` if a configured DB cannot persist a generated report.
- Stripe webhooks use `payment_events` claim-before-process idempotency and return `500 STRIPE_FULFILLMENT_FAILED` on DB write failures so Stripe can retry.

---

## 💳 Billing foundation

AegisGrid uses official provider SDKs instead of hand-rolled payment protocols:

- Stripe: official `stripe`/stripe-node SDK for Checkout, Billing Portal, and webhook signature verification.
- x402: official v2 package set is used (`@x402/next`, `@x402/evm`, `@coinbase/x402`) for pay-per-report (`POST /api/x402/report`) and pay-per-enrichment (`POST /api/x402/enrich`) endpoints, including exact EVM scheme verification, settlement, deterministic source-bounded result persistence before settlement, and post-settlement database audit log tracking.
- x402 operator lookup: `GET /api/x402/audit` requires an admin bearer token and `DATABASE_URL`; query by exactly one of `report_id`, `transaction`, or `payment_event_id` to retrieve x402 payment events, linked report records, and neutral credit-ledger audit rows.

Current Stripe routes:

- `POST /api/billing/checkout` — authenticated users only; creates Checkout sessions for configured Pro or report-pack price IDs; requires `DATABASE_URL` so webhook fulfillment can persist.
- `POST /api/billing/portal` — authenticated users only; creates Stripe Billing Portal sessions for subjects with a stored `stripe_customer_id`.
- `POST /api/billing/webhook` — raw-body Stripe signature verification, live/test mode guard via `STRIPE_LIVE_MODE`, DB claim-before-process idempotency, subscription entitlement upserts, and report-pack credit ledger entries.

---

## 🔭 Scanner backend constraints

`/api/scanner` is a dual-path scanner route: passive modules run in-process, while active modules remain a guarded proxy to a private scanner backend.

- Passive lookups (`rdns`, `whois`, `subdomains`, `geoloc`, `vuln`) work without `SCANNER_URL` or `SCANNER_KEY`.
- Active scans require an authenticated scanner subject, target entitlement, and both `SCANNER_URL` and `SCANNER_KEY`.
- Target entitlement can come from DNS TXT ownership verification (`/api/scanner/verification`) or admin allowlist entries (`SCANNER_ALLOWED_TARGETS` / `/api/scanner/admin/allowlist`).
- The public route does not use `SCANNER_REQUIRE_VERIFICATION=false` to open active scans.
- `SCANNER_ALLOWED_TARGETS` accepts comma-separated exact hosts/IPs plus wildcard subdomains such as `*.example.com` as a read-only baseline.
- Admin audit export is available at `/api/scanner/admin/audit` and is gated to admin/local operators.
- Active scanning must run in a **separate private service** you own.
- That service must also enforce ownership verification or an explicit allowlist before executing any scan.
- Scanner V2 now has a private localhost HTTP runner and passive adapters under [`src/server/scanner-v2/`](src/server/scanner-v2/), documented in [`docs/scanner-v2.md`](docs/scanner-v2.md).
- Run it with `npm run scanner:v2` after setting `SCANNER_KEY`; default bind is `127.0.0.1:4007`.
- Passive adapters are wired for RDNS, RDAP/WHOIS, CT subdomains, geolocation, and CVE/CPE evidence correlation.
- Scanner audit events are emitted as structured logs and can persist to `.data/scanner-audit.jsonl`.
- Source health is available at `/api/scanner/health`.
- Local Scanner V2 active adapters remain intentionally unwired; a configured external backend must enforce its own ownership and rate/concurrency controls too.
- Active scanner proxy now has token subject auth, DNS TXT target verification scaffold, admin allowlist management, and audit export; production OAuth/database integration is still planned.

---

## 📁 Project structure

```
aegisgrid/
├── src/
│   ├── app/
│   │   ├── page.tsx              # main dashboard SPA
│   │   ├── layout.tsx            # root layout, meta, fonts
│   │   ├── globals.css           # Tailwind + custom styles
│   │   └── api/                  # API route directories
│   │       ├── auth/session          token auth session metadata
│   │       ├── reports               feature-gated deterministic report foundation
│   │       ├── platform/status       sanitized readiness for auth/db/redis/billing/feeds
│   │       ├── comms                 feature-gated public source registry
│   │       ├── earthquakes/          USGS feeds
│   │       ├── fires/                NASA FIRMS + EONET
│   │       ├── flights/              ADS-B / OpenSky
│   │       ├── satellites/           TLE / CelesTrak
│   │       ├── cyber-threats/        threat intel
│   │       ├── osint/                passive DNS/RDAP/CT/CVE
│   │       ├── scanner/              passive scanner + guarded active proxy
│   │       ├── balloons/             placeholder (empty)
│   │       ├── radiation/            placeholder (empty)
│   │       └── ...                   weather, markets, news, etc.
│   ├── components/               # 14 React components
│   │   ├── AegisGridMap.tsx          MapLibre map + all layers
│   │   ├── OsintPanel.tsx            passive cyber lookup UI
│   │   ├── LiveAlerts.tsx            real-time alert feed
│   │   ├── IntelFeed.tsx             GDELT/RSS intel stream
│   │   ├── LayerPanel.tsx            layer toggle sidebar
│   │   └── ...                       markets, search, camera, etc.
│   ├── lib/
│   │   ├── ai/report-generator.ts   deterministic/source-bounded report helper
│   │   ├── auth/app-auth.ts         token subject parsing
│   │   ├── billing/guard.ts         fail-closed premium access checks
│   │   ├── db/                      Postgres client + app repository
│   │   ├── features.ts              feature flag guard
│   │   ├── html.ts                   popup HTML escaping
│   │   ├── reports/report-store.ts  report persistence seam
│   │   ├── ssrf-guard.ts            SSRF protection for proxied URLs
│   │   └── bulgaria-sources.ts      regional source config
│   ├── server/
│   │   └── scanner-v2/              private runner + passive adapters
│   └── proxy.ts                  # API request proxy / rate limiter
├── docs/
│   ├── scanner-v2.md             # Scanner V2 local service notes
│   └── sources.md                # source register + licensing notes
├── db/
│   └── schema.sql                 # Postgres commercial persistence schema
├── public/                       # logos, favicons, manifest, OG image
├── .env.example                  # all env vars with annotations
├── Dockerfile                    # container build
├── docker-compose.yml            # local stack
└── AGENTS.md                     # AI agent coding guidelines
```

---

## 📋 Source register

All data sources are documented in [`docs/sources.md`](docs/sources.md) with:

- Source URL and attribution requirements
- API key requirements (none / optional / required)
- Update cadence and confidence level
- License/terms notes and current status

Placeholder routes (`balloons`, `radiation`) are clearly marked as returning
empty data until lawful source adapters are reviewed and approved.

---

## 🧪 Quality gates

Every commit must pass:

```bash
npm run test   # Vitest unit tests
npm run lint   # ESLint 9 + next config
npm run typecheck
npm run build  # full Next.js production build
```

> 📝 The upstream codebase uses broad `any` types in places. Type tightening
> is planned in small follow-up slices with test coverage — stability first.

---

## 🌿 Branch convention

- Default branch: **`master`** (not `main`)
- Remote: `origin/master`
- Feature branches → PR against `master`

---

## 🗺️ Roadmap (next)

### Completed (foundation scaffolds)
- [x] Rebrand from Osiris to AegisGrid (package, UI, metadata, console prefixes)
- [x] Lint cleanup, Next.js type validation, middleware migration to Next proxy
- [x] SSRF guards, rate limiting, path traversal protection on OSINT routes
- [x] OSINT route safety test coverage (scanner scope, policy, audit)
- [x] Scanner V2 passive runner + in-process passive adapters (rDNS, WHOIS, CT subdomains, geoloc, CVE)
- [x] Scanner audit persistence + source health endpoint (`/api/scanner/health`)
- [x] Scanner auth boundary + entitlement verification scaffold (token subject auth, DNS TXT ownership verification, admin allowlist CRUD, audit export)
- [x] Platform auth/billing/report foundation (general token auth, fail-closed premium guard, `/api/auth/session`, `/api/platform/status`, `/api/reports` deterministic provider)
- [x] Postgres readiness surfaced in Docker Compose and sanitized platform status
- [x] Redis shared cache seam (`src/lib/cache/cache-store.ts`) with optional `REDIS_URL`, `ioredis` backing, in-memory TTL fallback, and sanitized readiness metadata
- [x] Postgres commercial persistence foundation (schema, `pg` client/repository, DB-backed entitlements, report persistence fail-closed)
- [x] Official Stripe SDK foundation (authenticated checkout sessions, billing portal route, raw-body webhook signature verification, live/test mode guard, DB idempotency claims, subscription entitlement/report-pack credit fulfillment)
- [x] Official x402 v2 packages used for protected pay-per-report (`POST /api/x402/report`) and pay-per-enrichment (`POST /api/x402/enrich`) routes with exact EVM scheme, settlement, linked result metadata, and post-settlement database audit log tracking
- [x] x402 operator audit lookup (`GET /api/x402/audit`) gated by admin auth for locating paid report/payment records by report ID, transaction hash, or payment event ID
- [x] Comms registry foundation behind `FEATURE_COMMS` with embed/link-out metadata and tactical-feed exclusion
- [x] AIS readiness metadata in maritime route without fake live vessel telemetry
- [x] External AI report provider abstraction (deterministic/OpenAI/Hermes) with prompt-injection controls, citation validation, fail-closed response parsing, and sanitized output
- [x] Deployment scaffolding: Docker Compose, systemd unit, nginx reverse proxy config
- [x] OAuth layer (GitHub/Google Auth.js integration)
- [x] Prisma Database Schema & Singleton implementation
- [x] Content Security Policy (CSP) & strict security headers
- [x] Type tightening + strict backend endpoint types + unit test coverage

### Up next
- [ ] Redis job queue and background feed refresh workers
- [ ] Lawful radiosonde (balloons) source adapter
- [x] Radiation monitoring adapter (Safecast CC0 public API) with age-classification, GeoJSON, graceful degradation
- [ ] Expanded AIS maritime tracking
- [ ] Comms/collaboration features

> Completed items are foundation scaffolds, not full commercial production systems.
> Remaining feature flags default to `false`; don't claim premium/auth/billing is live.

---

## 🙏 Attribution

AegisGrid is a fork of the upstream **Osiris** project by
[simplifaisoul](https://github.com/simplifaisoul). Upstream attribution
is preserved for license and history clarity. Active product branding,
repository identity, and ongoing development are AegisGrid.

---

*Built with ☕ and healthy paranoia.*
