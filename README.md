```
     _    _____ ____ ___ ____   ____ ____  ___ ____
    / \  | ____/ ___|_ _/ ___| / ___|  _ \|_ _|  _ \
   / _ \ |  _|| |  _ | |\___ \| |  _| |_) || || | | |
  / ___ \| |__| |_| || | ___) | |_| |  _ < | || |_| |
 /_/   \_\_____\____|___|____/ \____|_| \_\___|____/
```

# AegisGrid 🛰️

**Global situational intelligence grid.**

A lawful OSINT and situational-awareness dashboard with AI-powered
analysis, real-time sensor visualizations, and premium access control.

> ⚠️ This is **not** a hacking tool. See [Safety Model](#-safety-model).

---

## 📡 Features

### Main Dashboard (`/`)
GPU-rendered MapLibre GL map with 25+ live data layers:

| Domain | Layers | Status |
|---|---|---|
| 🌍 Geophysics | Earthquakes (USGS), fires (NASA FIRMS), weather, space weather (NOAA SWPC) | ✅ Live |
| ✈️ Aviation | ADS-B flights, satellite TLE orbits (CelesTrak) | ✅ Live |
| 🚢 Maritime | Static ports/chokepoints, AIS readiness metadata | ✅ Live |
| 🔒 Cyber OSINT | DNS, WHOIS, certs, CVE, OTX threats, IP sweep (11 tools) | ✅ Live |
| 📰 Intel | GDELT global incidents, RSS news | ✅ Live |
| ☢️ Radiation | Safecast CC0 public API — real CPM measurements | ✅ Live |
| 🎈 Balloons | Permanent placeholder — no free lawful API exists | 📋 Documented |

### Premium Dashboard (`/premium`)
Access-gated intelligence hub with 6 sections:

| Section | Description |
|---|---|
| AI Analysis | DeepSeek-powered situational briefings from live sensor data |
| Sensor Dashboard | Recharts visualizations — earthquake bars, sensor donut, stat cards |
| Threat Intelligence | IP/domain/hash lookup — OTX, Tor check, reputation scoring |
| Global Events | 15 latest GDELT events with coordinates and source links |
| Comms & Live Feeds | SDR radio, ATC audio, agency briefings (8 sources, 4 categories) |
| Billing | Stripe subscriptions + x402 USDC pay-per-use |

### Payment System
- **Stripe** — monthly subscriptions with webhook entitlement fulfillment
- **x402 USDC** — pay-per-use with free Dexter facilitator
- **Access tokens** — HMAC-signed time-limited tokens for purchased access
- **Feature flags** — `FEATURE_STRIPE`, `FEATURE_X402` independently toggleable
- **Config-aware UI** — shows available payment options, setup guides for missing keys

---

## 🛡️ Safety model

AegisGrid is a **defensive research and awareness** tool.

### ✅ Allowed
- Passive public-data collection with source attribution
- DNS, RDAP, certificate transparency, public threat-intel, CVE lookups
- User-authorized scanning through a separate backend you own/control
- Link-outs or embeds only when source terms allow
- AI-generated reports from provided source data only (no hallucination)

### 🚫 Not allowed
- Exploit execution, malware, phishing, credential theft, brute force
- Unauthorized or unauthenticated deep/mass scanning
- Bypassing paywalls, CAPTCHAs, robots.txt, rate limits, or source ToS
- Fake telemetry presented as production truth

---

## ⚙️ Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Framer Motion, Lucide icons |
| Styling | Tailwind CSS 4 |
| Map | MapLibre GL (GPU-rendered) |
| Charts | Recharts (free MIT) |
| AI | DeepSeek, Gemini, OpenAI (provider-abstracted) |
| Logging | Pino structured JSON logging |
| Auth | NextAuth (OAuth) + bearer token auth + access tokens |
| Payments | Stripe SDK + x402 protocol (USDC) |
| Security | SSRF guard (3-layer), CSRF protection, CSP headers, rate limiting |
| Language | TypeScript 5 |

---

## 🚀 Quick start

```bash
git clone https://github.com/NukeThemAII/aegisgrid.git
cd aegisgrid
npm install
cp .env.example .env.local   # edit as needed
npm run lint                  # must pass (0 errors)
npm run build                 # must pass
npm run dev                   # http://localhost:3000
```

Most layers work **without API keys**. For premium features, set:
```env
FEATURE_PREMIUM=true
FEATURE_AI_REPORTS=true
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
AUTH_USER_TOKENS=testuser:test-token-abc
AUTH_USER_ENTITLEMENTS=testuser:premium
AUTH_STATIC_ENTITLEMENTS_FALLBACK=true
```

---

## 🔑 Payment configuration

```
FEATURE_PREMIUM=true     # Master switch
FEATURE_STRIPE=true      # Enable Stripe (needs keys)
FEATURE_X402=true        # Enable x402 USDC (needs address)
```

**Stripe keys needed:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`

**x402 keys needed:** `X402_ENABLED=true`, `X402_RECEIVING_ADDRESS` (0x...), `X402_FACILITATOR_URL` (free Dexter: `https://dexter.cash/facilitator`)

---

## 📁 Project structure

```
aegisgrid/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # main map dashboard
│   │   ├── layout.tsx                  # root layout + PREMIUM nav button
│   │   ├── premium/page.tsx            # premium intelligence hub
│   │   └── api/                        # 50+ API routes
│   ├── components/
│   │   ├── map/                        # AegisGridMap
│   │   ├── panels/                     # OsintPanel, PremiumPanel, LayerPanel, etc.
│   │   │   └── osint/                  # OsintTabs, OsintInput, OsintResults
│   │   ├── premium/                    # AiAnalysis, SensorCharts, ThreatAnalysis,
│   │   │                                GlobalEvents, CommsPanel
│   │   └── ui/                         # ErrorBoundary, SearchBar, SharePanel, etc.
│   ├── lib/
│   │   ├── ai/                         # AI providers (deepseek, gemini, openai)
│   │   ├── adapters/                   # Safecast radiation, comms registry
│   │   ├── auth/                       # Bearer token + OAuth
│   │   ├── billing/                    # Premium access guard
│   │   ├── premium/                    # Access tokens (HMAC time-limited)
│   │   ├── rate-limit.ts               # Per-route rate limiter (20 configs)
│   │   ├── ssrf-guard.ts               # 3-layer SSRF protection
│   │   ├── csrf.ts                     # Origin/Referer validation
│   │   ├── scanner-result-format.ts    # Response sanitization
│   │   └── logging.ts                  # Pino structured logger
│   └── proxy.ts                        # CSRF + rate limiting + security headers
├── docs/
│   └── sources.md                      # Source register with license/status
├── TASK.md                             # Task backlog (completed + remaining)
└── LOG.md                              # Development log (all sessions)
```

---

## 🧪 Quality gates

Every commit passes:
```bash
npm run test     # 614 tests, 58 files (Vitest)
npm run lint     # 0 errors, 0 warnings (ESLint 9)
npm run build    # Full Next.js production build (Turbopack)
```

---

## 🗺️ Roadmap

### Completed
- [x] Rebrand to AegisGrid, lint/type cleanup, security hardening
- [x] SSRF guard (3-layer: canonicalize → validate → socket-pin)
- [x] Scanner V2 passive runner + auth boundary + audit
- [x] Stripe billing + x402 USDC payment foundations
- [x] AI report generation (DeepSeek/Gemini/OpenAI with prompt-injection controls)
- [x] Radiation adapter (Safecast CC0, real CPM data)
- [x] Balloons documented as permanent placeholder
- [x] Feed route rate limiting (17 routes, 20 preset configs)
- [x] CSRF protection (proxy-level Origin/Referer)
- [x] Scanner response sanitization (field allowlisting)
- [x] Premium dashboard (`/premium`) with 6 sections
- [x] Premium access gate (entitlement check + payment options)
- [x] Access token system (HMAC time-limited tokens)
- [x] Comms registry (8 sources: SDR, ATC, agency briefings)
- [x] Component directory reorganization (map/panels/premium/ui)
- [x] OsintPanel refactor (834 → 253 lines, 3 sub-components)
- [x] Pino structured logging
- [x] Docker deduplication

### Needs credentials
| Feature | Required |
|---|---|
| Stripe subscriptions | `STRIPE_SECRET_KEY` + price IDs |
| x402 USDC payments | `X402_RECEIVING_ADDRESS` |
| GitHub OAuth login | `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` |
| AIS maritime tracking | `AISSTREAM_API_KEY` (free at aisstream.io) |
| DB audit trails | `DATABASE_URL` (Postgres) |

---

## 🙏 Attribution

AegisGrid is a fork of the upstream **Osiris** project by
[simplifaisoul](https://github.com/simplifaisoul). Upstream attribution
is preserved for license and history clarity.

---

*Built with ☕ and healthy paranoia.*
