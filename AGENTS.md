# AGENTS.md — AegisGrid V2

> Repository: `https://github.com/NukeThemAII/aegisgrid.git`
> Product name: **AegisGrid**
> Repository slug: **aegisgrid**
> Package/app name: **aegisgrid**
> Development branch: **master**
> Tagline: **Situational Intelligence Grid**

This file is the operating manual for AI coding agents working on AegisGrid V2. The GitHub repository is already renamed to `NukeThemAII/aegisgrid`. Develop directly in `master` unless the human owner explicitly asks for feature branches.

The goal is to turn the existing app into a safer, cleaner, more reliable, monetizable OSINT dashboard with real data pipelines, working scanner functionality, AI intelligence reports, premium access controls, Stripe payments, and optional x402 USDC pay-per-use flows.

---

## 1. Product mission

AegisGrid is a global situational-awareness and OSINT dashboard that combines lawful open data, passive cyber intelligence, public live feeds, maps, market/news context, and AI-generated briefings.

The product must feel like a premium command center, but it must be engineered like a serious production app: deterministic data adapters, typed API routes, cached open-source feeds, secure scanning rules, clean monetization, and no fake “magic” results.

### Primary users

* OSINT hobbyists and researchers
* Journalists and geopolitical analysts
* Security teams doing passive reconnaissance
* Traders and market/news watchers
* Emergency-awareness and travel-risk users
* Developers who want paid API/report access through Stripe or x402

### Core promise

“Show me what is happening, where it is happening, what sources support it, and what actions or risks matter next.”

---

## 2. Development workflow

The owner wants simple development directly in `master`.

### Required workflow

```bash
git clone https://github.com/NukeThemAII/aegisgrid.git
cd aegisgrid
git checkout master
git pull origin master
npm install
npm run lint
npm run build
```

Before edits, inspect the current state. After edits, run lint/build again. Commit small, logical changes directly to `master`.

### Main-branch safety rules

* Do not force-push unless explicitly instructed.
* Do not rewrite history unless explicitly instructed.
* Before large refactors, create a local backup tag or commit checkpoint.
* Keep changes small and reviewable.
* Do not mix unrelated features in one commit.
* Do not start Stripe, x402, AI, database, Redis, or scanner-service work until the foundation is stable.

Useful checkpoint command before larger edits:

```bash
git status
git add -A
git commit -m "chore: checkpoint before aegisgrid v2 foundation" || true
```

Only run this if there are existing local changes that need preserving.

---

## 3. Fork identity and rebrand rules

The active GitHub repository is:

```txt
https://github.com/NukeThemAII/aegisgrid.git
```

Rebrand all visible and internal product identity from Osiris to AegisGrid unless preserving upstream attribution in `NOTICE`, `README`, or license files.

### Required renames

* `OSIRIS` → `AEGISGRID`
* `Osiris` → `AegisGrid`
* `osiris` → `aegisgrid`
* `GLOBAL INTELLIGENCE COMMAND` → `SITUATIONAL INTELLIGENCE GRID`
* `GLOBAL INTELLIGENCE PLATFORM` → `OPEN SITUATIONAL INTELLIGENCE`
* `OSIRIS RECON` → `AEGIS RECON`

### Files likely requiring rebrand

* `package.json`
* `README.md`
* `src/app/layout.tsx`
* `src/app/page.tsx`
* `src/components/*`
* metadata, title, description, OpenGraph tags
* splash screen copy
* header copy
* mobile drawer labels
* console log prefixes
* error messages
* favicon/logo assets
* donation/support links

### Logo direction

Create a clean SVG logo in `public/aegisgrid.svg`:

* circular grid/radar mark
* shield or horizon line motif
* no skulls, weapons, extremist symbols, or military insignia
* works on dark background
* simple enough for favicon
* editable SVG source must be committed

Do not ship generated raster-only logos as the only source asset.

---

## 4. Current codebase audit snapshot

Agents must audit the current `NukeThemAII/aegisgrid` repo before coding. Do not assume this file is perfectly up to date.

As of the last planning pass, the codebase appeared to be a Next.js 16 / React 19 app with map layers, feed panels, scanner proxy, and OSINT route handlers.

Important observed codebase state:

1. The app uses Next.js, React, MapLibre, HLS.js, RSS Parser, satellite.js, Framer Motion, and Vercel Analytics.
2. `src/app/page.tsx` has progressive/layer-aware data loading, reduced polling, URL-state sharing, map style switching, mobile panels, and an IP Sweep visualization hook.
3. `src/components/OsintPanel.tsx` includes tabs for port scan, vuln scan, DNS, WHOIS, certs, threats, headers, SSL/TLS, subdomains, tech detect, and IP sweep.
4. `src/app/api/osint/sweep/route.ts` implements a passive subnet sweep using Shodan InternetDB plus `ip-api.com` geolocation. It rate-limits and blocks private/reserved IP ranges.
5. `src/app/api/scanner/route.ts` is a hardened scanner proxy requiring `SCANNER_URL` and `SCANNER_KEY`; it blocks unsafe targets using shared SSRF validation and restricts public scan types.
6. `src/lib/ssrf-guard.ts` implements hostname/IP validation, DNS resolution checks, private/reserved range blocking, redirect-aware `safeFetch`, and a simple in-memory rate limiter.
7. `src/app/api/osint/cve/route.ts` fetches CVE details from MITRE first and falls back to CIRCL.
8. The UI may reference `/api/balloons` and `/api/radiation`; verify whether route files exist locally. Treat them as broken/missing until verified.
9. Map popups may use `setHTML` with external data. This is an XSS risk unless all interpolated values are escaped or popups are rendered safely.
10. Any simulated telemetry must be removed or clearly labeled as demo/simulated. Do not present simulated metrics as production truth.

---

## 5. Non-negotiable safety and legality rules

AegisGrid must be a lawful OSINT and defensive research tool.

### Allowed

* Passive public-data collection
* Public RSS/news/market/geospatial feeds
* DNS, RDAP, certificate transparency, public threat-intel lookups
* User-authorized scanner functionality
* Paid reports summarizing open sources with citations
* Link-outs to external live feeds when embedding is not allowed
* Rate-limited, scoped, auditable recon workflows

### Forbidden

* No malware, phishing, credential theft, exploit execution, brute force, evasion, or unauthorized access
* No tools for stalking private people, doxxing, harassment, or targeting protected individuals
* No live tactical police feed rebroadcasting when prohibited by law or source terms
* No “deep scan everything” unauthenticated public endpoint
* No automated vulnerability exploitation
* No bypassing paywalls, CAPTCHAs, rate limits, source ToS, or robots restrictions
* No collection or display of private personal data beyond what a lawful public source explicitly provides

### Scanner scope rule

Active scans require one of these:

1. user has verified domain ownership using DNS TXT challenge;
2. target belongs to a configured allowlist in admin settings;
3. scan type is passive only and uses third-party public databases, not network probing.

Public anonymous users may use passive lookups only.

---

## 6. Target architecture

Keep the Next.js app but split responsibilities cleanly.

```txt
src/
  app/
    api/
      auth/
      billing/
      x402/
      reports/
      feeds/
      osint/
      scanner/
    page.tsx
    layout.tsx
  components/
    map/
    panels/
    billing/
    reports/
    ui/
  lib/
    adapters/
    ai/
    auth/
    billing/
    cache/
    db/
    env.ts
    errors.ts
    fetch.ts
    logging.ts
    rate-limit.ts
    ssrf-guard.ts
    validation.ts
  server/
    jobs/
    queues/
    scanner-client.ts
  types/
```

### Design principles

* API routes should be thin. Put business logic in `src/lib/*` or `src/server/*`.
* Every external source must have a typed adapter.
* Every adapter returns normalized objects plus `source`, `source_url`, `fetched_at`, and `confidence` when applicable.
* Use `zod` for request validation and environment validation.
* Use server-side caching for public feeds.
* Add stale-while-revalidate behavior where possible.
* Never trust client-side premium flags.
* Never expose API keys to browser code.

---

## 7. Recommended dependencies

Add only when needed and keep the bundle lean.

Recommended foundation dependencies:

```bash
npm install zod he p-limit lru-cache
npm install -D vitest @testing-library/react playwright eslint-plugin-security
```

Recommended later dependencies:

```bash
npm install pino jose @prisma/client prisma stripe isomorphic-dompurify
npm install bullmq ioredis
npm install openai ai
```

Optional x402 dependencies must be checked against official current docs before implementation. Do not guess SDK APIs.

---

## 8. Environment variables

Create or update `.env.example` and keep it synchronized with code.

```env
# App
NEXT_PUBLIC_APP_NAME=AegisGrid
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/aegisgrid

# Auth
AUTH_SECRET=change-me
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
STRIPE_PRICE_REPORT_PACK=

# x402 / USDC
X402_ENABLED=false
X402_RECEIVING_ADDRESS=
X402_FACILITATOR_URL=
X402_NETWORK=eip155:8453
X402_REPORT_PRICE_USDC=1.00
X402_API_PRICE_USDC=0.05

# AI
AI_PROVIDER=none
OPENAI_API_KEY=
HERMES_API_KEY=
AI_MODEL_REPORTS=
AI_MODEL_FAST=

# Scanner proxy
SCANNER_URL=
SCANNER_KEY=
SCANNER_ALLOWED_TARGETS=
SCANNER_REQUIRE_VERIFICATION=true

# Optional public/free APIs
NASA_FIRMS_MAP_KEY=
AISSTREAM_API_KEY=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
VIRUSTOTAL_API_KEY=
ABUSEIPDB_API_KEY=
OTX_API_KEY=
URLSCAN_API_KEY=
CENSYS_API_ID=
CENSYS_API_SECRET=
GREYNOISE_API_KEY=
SHODAN_API_KEY=
N2YO_API_KEY=

# Jobs / cache
REDIS_URL=
CRON_SECRET=

# Feature flags
FEATURE_AI_REPORTS=false
FEATURE_COMMS=false
FEATURE_PREMIUM=false
FEATURE_X402=false
```

---

## 9. Data source strategy

Prefer free, lawful, documented, and stable sources. Build source adapters so individual feeds can be swapped or disabled.

### Feed adapter contract

Every adapter should return:

```ts
export interface SourceMeta {
  source: string;
  source_url?: string;
  fetched_at: string;
  license?: string;
  attribution?: string;
  confidence?: 'low' | 'medium' | 'high';
}
```

### Geospatial and event feeds

Implement or preserve adapters for:

* USGS earthquakes
* NASA EONET natural events
* NASA FIRMS fires, with API key when configured
* NOAA SWPC space weather
* GDELT global events/news
* GDACS disaster alerts
* ReliefWeb humanitarian updates
* Open-Meteo weather overlays
* OpenAQ air quality
* ACLED only if account/license allows the planned use
* OpenStreetMap/Overpass only with strict caching and rate limits

### Aviation

Preferred:

* OpenSky Network where available
* ADS-B link-outs only unless the source license allows API ingestion
* user-configurable adapter for paid ADS-B APIs

Never scrape sites that forbid automated collection.

### Maritime

Start with:

* curated static ports/chokepoints dataset
* optional AISStream if the user supplies a free key
* link-outs to VesselFinder/MarineTraffic only where embedding/API terms allow it

### Satellites and balloons

* CelesTrak TLE data for satellites
* NOAA/NWS or radiosonde community sources for balloons only if licensing is clear
* Fix missing `/api/balloons` or remove the layer until a real source adapter exists

### Radiation

* Safecast API/datasets if allowed
* EU public radiation networks if API/license allows
* Fix missing `/api/radiation` or remove the layer until a real source adapter exists

### Radio, SDR, emergency, and live streams

Build a “Comms” layer carefully.

Allowed source types:

* LiveATC link-outs for aviation audio if allowed by terms
* WebSDR/OpenWebRX public receivers
* NOAA weather radio streams
* public emergency-management YouTube live streams
* public agency press/live briefing channels

Rules:

* Store `embed_allowed` per feed.
* If embedding is not allowed, show an external-link card only.
* Do not market this as a police evasion or tactical-monitoring product.
* Do not include restricted tactical channels.
* Add jurisdiction disclaimer and source attribution.

---

## 10. Passive cyber OSINT features

Build these as passive lookups first. Active scanning comes later and must be scoped.

### Free/passive lookups

* DNS records using Node DNS resolver
* RDAP domain/IP ownership
* certificate transparency via crt.sh or another permitted CT source
* Shodan InternetDB for IP ports/vulns without API key
* MITRE CVE API
* CIRCL fallback CVE endpoint
* URLScan.io with optional key
* AlienVault OTX with optional key
* AbuseIPDB with optional key
* VirusTotal with optional key
* GreyNoise community/API with optional key
* Censys with optional key
* security headers check using `safeFetch`
* SSL/TLS certificate inspection
* subdomain enumeration from CT logs only by default

### Do not implement

* exploit modules
* credential checks
* password spraying
* unrestricted banner grabbing
* mass internet scanning
* stealth scanning
* WAF bypasses

---

## 11. Scanner V2 plan

The existing `/api/scanner` route should remain a proxy requiring `SCANNER_URL` and `SCANNER_KEY`. Build the actual scanner as a separate local service on the VPS, not inside the public Next.js server.

### Service shape

Run scanner service on private localhost or private Docker network only.

```txt
Next.js /api/scanner
  -> validates user, entitlement, target, scan type, scope
  -> signs request with SCANNER_KEY
  -> sends to local scanner service
  -> stores audit log
  -> returns normalized result
```

### Scanner service endpoints

Safe baseline endpoints:

* `GET /scan/quick?target=` — top common ports only, low rate, verified targets only
* `GET /scan/ssl?target=` — TLS certificate and chain metadata
* `GET /scan/headers?target=` — HTTP headers/security score via safe fetch
* `GET /scan/rdns?target=` — reverse DNS
* `GET /scan/subdomains?target=` — passive CT-based enumeration
* `GET /scan/tech?target=` — passive HTTP tech fingerprint, no exploit probes
* `GET /scan/whois?target=` — RDAP/WHOIS normalization
* `GET /scan/geoloc?target=` — public IP geolocation
* `GET /scan/vuln?target=` — passive CVE correlation from detected CPE/banner only, no exploit execution

### Scanner implementation rules

* Use a job queue for slow scans.
* Enforce per-user and per-IP limits.
* Enforce global concurrency.
* Time out aggressively.
* Record audit logs.
* Never scan private/reserved ranges from public requests.
* Never allow arbitrary port ranges for anonymous users.
* Premium users still need ownership verification for active scans.
* Admin allowlists may bypass ownership verification for internal deployments.

---

## 12. AI functionality

AI should improve analysis, not invent facts.

### Free AI features

* short map/event summaries
* “what changed today?” brief
* plain-language explanation of selected event/feed
* simple source clustering

### Premium AI features

* AI intelligence report PDF/Markdown export
* entity dossier: domain, IP, company, region, event, vessel, aircraft, CVE
* watchlist alerts with AI summaries
* timeline builder from open-source events
* risk matrix with source citations
* market-moving news brief
* “Ask the map” natural-language query over cached feeds
* multi-source corroboration scoring
* saved investigations/workspaces
* API endpoint for paid machine-readable reports

### AI report requirements

Every report must include:

* executive summary
* key findings
* timeline
* source list
* confidence notes
* uncertainty section
* “what would change this assessment” section
* timestamps and query parameters

Never let AI produce unsupported claims. If source evidence is weak, say so.

### AI agent/job system

Create scheduled jobs:

* `jobs:ingest:news`
* `jobs:ingest:markets`
* `jobs:ingest:events`
* `jobs:brief:global`
* `jobs:brief:watchlists`
* `jobs:cleanup`

Use `CRON_SECRET` to protect cron endpoints.

---

## 13. Premium monetization

Implement feature gates so free/premium can be changed from config without rewriting components.

### Suggested tiers

Free:

* public map layers
* limited passive lookups
* limited daily IP sweep
* basic news/market feed
* no saved investigations

Pro:

* higher API limits
* saved watchlists
* AI reports
* report export
* premium threat-intel lookups using user/account quota
* authorized scanner jobs
* alert notifications

Team:

* shared investigations
* API keys
* team quotas
* admin allowlists
* audit logs
* white-label exports

Pay-per-use:

* one AI report
* one x402 API result
* one report pack
* one premium data enrichment

### Billing implementation

Use Stripe for subscriptions and normal card payments. Use x402 for USDC pay-per-request or pay-per-report.

Stripe:

* route: `POST /api/billing/checkout`
* route: `POST /api/billing/portal`
* webhook: `POST /api/billing/webhook`
* verify webhook signatures
* store customer ID and subscription state server-side
* grant access based on Stripe webhooks or Stripe entitlements, not browser state

x402:

* route: `GET/POST /api/x402/report`
* route: `GET/POST /api/x402/enrich`
* return HTTP 402 payment requirement for paid resources
* verify payment server-side through facilitator
* create a ledger entry after valid payment
* fulfill report/API access only after verification
* support idempotency keys to prevent double fulfillment

### Billing database tables

Minimum tables:

* `User`
* `Account`
* `Subscription`
* `Entitlement`
* `CreditLedger`
* `PaymentEvent`
* `ApiKey`
* `AuditLog`
* `Investigation`
* `Report`
* `Watchlist`
* `ScanJob`

---

## 14. Database schema direction

Use Prisma with Postgres.

Core models:

```prisma
model User {
  id               String   @id @default(cuid())
  email            String?  @unique
  name             String?
  role             String   @default("user")
  plan             String   @default("free")
  stripeCustomerId String?  @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model Entitlement {
  id        String   @id @default(cuid())
  userId    String
  feature   String
  active    Boolean  @default(true)
  source    String
  expiresAt DateTime?
  createdAt DateTime @default(now())
}

model CreditLedger {
  id           String   @id @default(cuid())
  userId       String
  kind         String
  amount       Int
  balanceAfter Int
  reason       String
  paymentRef   String?
  createdAt    DateTime @default(now())
}

model Report {
  id        String   @id @default(cuid())
  userId    String?
  title     String
  query     String
  status    String   @default("queued")
  markdown  String?
  sources   Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ScanJob {
  id        String   @id @default(cuid())
  userId    String?
  target    String
  scanType  String
  status    String   @default("queued")
  result    Json?
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Expand only as needed.

---

## 15. Security hardening tasks

### Must fix before public V2 launch

* Escape or sanitize all popup HTML in the map component.
* Replace direct `setHTML` interpolation with safe React popup rendering if practical.
* Validate every API query with `zod`.
* Centralize external fetch with timeout, retry policy, and source-specific user-agent.
* Keep `safeFetch` for user-controlled URLs.
* Add CSRF protection for state-changing routes.
* Add strict security headers.
* Add rate limiting backed by Redis for production.
* Add audit logging for scans, payments, report generation, and admin actions.
* Avoid logging secrets, tokens, payment payloads, or private user queries.
* Add `robots.txt` and ToS/acceptable-use copy.

### Security headers

Add middleware or Next config for:

* `Content-Security-Policy`
* `X-Content-Type-Options: nosniff`
* `Referrer-Policy`
* `Permissions-Policy`
* `Frame-Options` or CSP frame ancestors

Be careful: map tiles, YouTube embeds, HLS, and external live feeds may need explicit CSP allowances.

---

## 16. UI/UX upgrade plan

### Keep

* command-center aesthetic
* map-first interface
* layer toggles
* mobile drawer
* live feed overlay
* keyboard shortcuts
* shareable map URLs

### Improve

* move from hardcoded panels to component modules
* add onboarding explaining sources and limitations
* add source badges and freshness timestamps on every layer
* add “data stale” warnings
* add empty/error states per layer
* add command palette
* add saved workspaces
* add report drawer
* add premium lock badges, not annoying popups
* add admin settings page for toggling free/premium features

### Do not fake data

If a metric is simulated, label it as demo or remove it. Production should show real telemetry such as successful feed fetch count, cache status, queue depth, or API latency.

---

## 17. Feature flags

Create `src/lib/features.ts`.

Example:

```ts
export const FEATURES = {
  aiReports: process.env.FEATURE_AI_REPORTS === 'true',
  x402: process.env.X402_ENABLED === 'true' || process.env.FEATURE_X402 === 'true',
  scanner: Boolean(process.env.SCANNER_URL && process.env.SCANNER_KEY),
  comms: process.env.FEATURE_COMMS === 'true',
  premium: process.env.FEATURE_PREMIUM === 'true',
};
```

Also support DB/admin overrides later.

---

## 18. API route standards

Every route handler must follow this pattern:

1. parse and validate input
2. authenticate if needed
3. check entitlement if premium
4. apply rate limit
5. call service/adapter
6. normalize response
7. add cache headers where appropriate
8. return structured errors

Error response shape:

```json
{
  "error": "Human readable error",
  "code": "MACHINE_CODE",
  "detail": "Optional safe detail"
}
```

Never leak stack traces to clients.

---

## 19. Testing requirements

Do not consider a feature complete without tests or at least a documented reason why tests were deferred.

### Unit tests

* `ssrf-guard`
* rate limit helpers
* source adapters
* payment entitlement helpers
* x402 verification logic
* scanner target validation
* popup sanitization helpers

### Integration tests

* API route validation
* Stripe webhook signature handling
* x402 paid resource flow
* scanner proxy with mocked scanner service
* AI report generation with mocked model

### E2E tests

* load dashboard
* toggle layers
* run passive DNS lookup
* run IP sweep mock
* create report mock
* premium lock behavior
* successful Stripe checkout webhook simulation

---

## 20. Performance rules

* Do not fetch every layer on first page load.
* Keep layer-aware loading.
* Use server cache for expensive/public feeds.
* Use clustering or tiles for large point datasets.
* Avoid rerendering the entire map for feed updates.
* Keep mobile fast; lazy-load heavy panels.
* Limit client bundle growth.
* Prefer server-side aggregation over client-side giant JSON.

---

## 21. Concrete V2 milestones

### M0 — Baseline audit on master

* Open `https://github.com/NukeThemAII/aegisgrid.git`.
* Checkout `master`.
* Pull latest from origin.
* Run `npm install`, `npm run lint`, and `npm run build`.
* Document current failing routes/build errors.

Acceptance:

* build state documented
* known codebase issues listed
* no code changes hidden inside audit commit

### M1 — Rebrand and stability

* Rebrand remaining Osiris strings to AegisGrid.
* Replace logo/favicon.
* Fix metadata.
* Add `.env.example`.
* Add source attribution page or docs file.
* Fix missing `/api/balloons` and `/api/radiation` by either implementing real adapters or disabling layers with clear “source unavailable” state.
* Remove or relabel simulated telemetry.

Acceptance:

* no visible Osiris branding except attribution/license
* app builds
* broken layers do not throw unhandled errors

### M2 — Security hardening

* Sanitize map popups.
* Add zod validation to API routes.
* Add production Redis rate limiter fallback.
* Add security headers.
* Add audit logs for scanner/report/billing routes.

Acceptance:

* SSRF tests pass
* XSS popup tests pass
* route validation tests pass

### M3 — Data adapter layer

* Move each source to `src/lib/adapters/*`.
* Normalize source metadata.
* Add source health endpoint.
* Add stale/fresh indicators.

Acceptance:

* each layer shows source and `fetched_at`
* disabled/missing source produces safe UI state

### M4 — Scanner V2

* Build local scanner service.
* Keep Next scanner route as authenticated proxy.
* Add target ownership verification.
* Add scan queue.
* Add results storage.

Acceptance:

* public anonymous users cannot active-scan arbitrary targets
* verified target scan works
* passivlookups remain available within limits

### M5 — AI reports

* Add report generation job.
* Add report UI drawer.
* Add Markdown export.
* Add source-cited output structure.
* Add watchlist brief prototype.

Acceptance:

* reports are reproducible from stored sources
* AI output includes uncertainty and source list
* report generation can be gated as premium

### M6 — Payments

* Add auth.
* Add Stripe Checkout subscriptions.
* Add Stripe webhook fulfillment.
* Add entitlements.
* Add x402 pay-per-report endpoint.
* Add credit ledger.

Acceptance:

* Stripe test subscription grants Pro
* webhook revocation removes Pro
* x402 test payment grants exactly one report/API result
* idempotency prevents duplicate fulfillment

### M7 — Comms layer

* Add public radio/SDR/live-source registry.
* Add `embed_allowed` enforcement.
* Add external-link card for restricted sources.
* Add source terms notes.

Acceptance:

* no forbidden rebroadcasting
* all feeds have source attribution and link-out

---

## 22. Initial task backlog for agents

Start with these tasks in order.

### Task 1 — Build verification

Run:

```bash
git checkout master
git pull origin master
npm install
npm run lint
npm run build
```

Fix TypeScript/build errors first. Do not add new features until baseline builds.

### Task 2 — Rebrand sweep

Search:

```bash
rg -n "OSIRIS|Osiris|osiris|GLOBAL INTELLIGENCE|COMMAND"
```

Replace with AegisGrid equivalents while preserving upstream attribution.

### Task 3 — Broken route check

Search API calls:

```bash
rg -n "fetch\('/api|fetch\(`/api|/api/" src
```

For every referenced route, confirm file exists under `src/app/api`. Implement, disable, or create safe placeholder responses.

### Task 4 — Popup sanitization

Find all `setHTML` and sanitize dynamic values. Prefer helper:

```ts
import { escape } from 'he';

export function e(value: unknown): string {
  return escape(String(value ?? ''), { useNamedReferences: true });
}
```

Use it for every external value interpolated into HTML strings.

### Task 5 — Feature gates

Create feature config and gate:

* AI reports
* scanner
* premium
* x402
* comms

### Task 6 — `.env.example`

Add the environment variables in this file and document which are optional/free.

### Task 7 — Source attribution page

Add `/sources` page or `docs/sources.md` listing every feed, source URL, license/terms note, update frequency, and whether it is free, optional API key, or premium.

---

## 23. Coding style

* TypeScript strict where practical.
* Prefer named exports.
* Avoid `any`; if unavoidable, isolate it at adapter boundary.
* Prefer `unknown` plus parsing.
* Use small functions with clear names.
* No giant components when splitting is easy.
* Keep styling consistent with existing tactical/glass UI but reduce clutter.
* Use comments to explain source limitations and security decisions, not obvious code.
* Do not commit secrets.
* Do not hardcode API keys.

---

## 24. Commit style

Use conventional commits:

```txt
feat: add source health endpoint
fix: sanitize map popup html
chore: rebrand package to aegisgrid
security: harden scanner target validation
test: add ssrf guard cases
```

Each commit or agent response should include:

* summary
* files changed
* tests run
* screenshots for UI changes when practical
* security notes if relevant
* migration notes if relevant

---

## 25. Definition of done

A task is done when:

* app builds
* lint passes or exceptions are justified
* relevant tests pass
* feature works locally
* errors are handled in UI
* source attribution is preserved
* premium gates cannot be bypassed client-side
* no secrets are exposed
* no safety rules are violated

---

## 26. Alternative product/module names

Current chosen name: **AegisGrid**.

Good alternatives for future products or modules:

* SignalDeck
* AtlasWatch
* VantageGrid
* SentinelMap
* WatchGrid
* OpenAegis
* GridIntel
* HorizonOSINT
* ArgusGrid
* LumenIntel

Before buying a domain or finalizing trademark/branding, check domain availability, GitHub availability, and obvious trademark conflicts.

---

## 27. First V2 command for coding agents

Start here:

```bash
git clone https://github.com/NukeThemAII/aegisgrid.git
cd aegisgrid
git checkout master
git pull origin master
npm install
npm run lint
npm run build
rg -n "OSIRIS|Osiris|osiris|GLOBAL INTELLIGENCE|COMMAND|setHTML|/api/balloons|/api/radiation" src package.json README.md
```

Then produce a short audit report before applying patches:

```txt
BUILD STATUS:
LINT STATUS:
BRANDING HITS:
MISSING ROUTES:
SECURITY HOTSPOTS:
SCANNER STATUS:
PAYMENT READINESS:
RECOMMENDED FIRST PATCH:
```

Do not start monetization until the baseline app builds and broken routes are handled.
