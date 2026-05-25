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
AI_PROVIDER=none         # deterministic enables local source-bounded reports
FEATURE_COMMS=false
FEATURE_PREMIUM=false
FEATURE_X402=false
X402_ENABLED=false
```

> 💡 Current foundation routes are intentionally conservative:
> `/api/auth/session`, `/api/platform/status`, `/api/reports`, and `/api/comms`
> are wired with token auth, DB-backed entitlement checks/report persistence,
> fail-closed premium checks, sanitized readiness metadata,
> deterministic/local report generation, and feature flags. Full OAuth, Redis
> queues/shared cache, Stripe webhooks, x402 facilitator verification, and
> external AI providers remain planned follow-up work.

---

## 🗄️ Database persistence

The Postgres foundation is now wired for commercial state:

- schema: `db/schema.sql`
- client/repository: `src/lib/db/postgres.ts`, `src/lib/db/app-repository.ts`
- persisted tables: `users`, `entitlements`, `credit_ledger`, `reports`
- report persistence seam: `src/lib/reports/report-store.ts`
- premium checks: `src/lib/billing/guard.ts`

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
- [x] Postgres/Redis readiness surfaced in Docker Compose and sanitized platform status (Redis clients/queues still planned)
- [x] Postgres commercial persistence foundation (schema, `pg` client/repository, DB-backed entitlements, report persistence fail-closed)
- [x] Comms registry foundation behind `FEATURE_COMMS` with embed/link-out metadata and tactical-feed exclusion
- [x] AIS readiness metadata in maritime route without fake live vessel telemetry

### Up next
- [ ] OAuth layer (GitHub/Google Auth.js or equivalent)
- [ ] Redis job queue and shared cache for background feed refresh
- [ ] External AI provider integration for situational reports (OpenAI/Hermes with citations and prompt-injection controls)
- [ ] Stripe webhooks/checkout and x402 facilitator verification for real premium entitlement sync
- [ ] Lawful radiosonde (balloons) source adapter
- [ ] Radiation monitoring adapter (Safecast / EU networks)
- [ ] Expanded AIS maritime tracking
- [ ] Type tightening + unit test coverage
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
