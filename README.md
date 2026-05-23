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
| 🔬 Scanner proxy | Guarded relay to an external scanner backend (503 when unconfigured) |
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

# ── Scanner proxy (guarded) ──────────────────────
SCANNER_URL=             # URL of your private scanner backend
SCANNER_KEY=             # shared secret
SCANNER_ALLOWED_TARGETS= # comma-separated exact hosts/IPs or *.example.com
SCANNER_REQUIRE_VERIFICATION=true  # keep true for public deployments

# ── Optional enrichment API keys ─────────────────
NASA_FIRMS_MAP_KEY=      AISSTREAM_API_KEY=
OPENSKY_CLIENT_ID=       OPENSKY_CLIENT_SECRET=
VIRUSTOTAL_API_KEY=      ABUSEIPDB_API_KEY=
OTX_API_KEY=             URLSCAN_API_KEY=
CENSYS_API_ID=           CENSYS_API_SECRET=
GREYNOISE_API_KEY=       SHODAN_API_KEY=
N2YO_API_KEY=            IPCAMLIVE_API_SECRET=

# ── Feature flags ────────────────────────────────
FEATURE_AI_REPORTS=false
FEATURE_COMMS=false
FEATURE_PREMIUM=false
FEATURE_X402=false
```

> 💡 Planned variables for database, auth, Stripe, x402, AI, and Redis
> exist in `.env.example` but are **not wired up yet**.

---

## 🔭 Scanner backend constraints

`/api/scanner` is **only a guarded proxy**. It does not scan anything itself.

- Requires both `SCANNER_URL` and `SCANNER_KEY` — returns HTTP 503 otherwise.
- With `SCANNER_REQUIRE_VERIFICATION=true`, targets must match `SCANNER_ALLOWED_TARGETS` before the proxy calls the scanner backend.
- `SCANNER_ALLOWED_TARGETS` accepts comma-separated exact hosts/IPs plus wildcard subdomains such as `*.example.com`.
- Active scanning must run in a **separate private service** you own.
- That service must also enforce ownership verification or an explicit allowlist before executing any scan.
- Do not expose a configured scanner proxy on a public deployment until auth/entitlement checks exist; until then, only explicitly allowlisted targets can reach the backend.

---

## 📁 Project structure

```
aegisgrid/
├── src/
│   ├── app/
│   │   ├── page.tsx              # main dashboard SPA
│   │   ├── layout.tsx            # root layout, meta, fonts
│   │   ├── globals.css           # Tailwind + custom styles
│   │   └── api/                  # 24 API route directories
│   │       ├── earthquakes/          USGS feeds
│   │       ├── fires/                NASA FIRMS + EONET
│   │       ├── flights/              ADS-B / OpenSky
│   │       ├── satellites/           TLE / CelesTrak
│   │       ├── cyber-threats/        threat intel
│   │       ├── osint/                passive DNS/RDAP/CT/CVE
│   │       ├── scanner/              guarded proxy (503 default)
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
│   │   ├── features.ts              feature flag guard
│   │   ├── html.ts                   popup HTML escaping
│   │   ├── ssrf-guard.ts            SSRF protection for proxied URLs
│   │   └── bulgaria-sources.ts      regional source config
│   └── middleware.ts             # request middleware
├── docs/
│   └── sources.md                # source register + licensing notes
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

- [ ] Auth layer (GitHub/Google OAuth)
- [ ] Database persistence (PostgreSQL)
- [ ] Redis job queue for background feed refresh
- [ ] AI-generated situational reports (feature-flagged)
- [ ] Stripe/x402 billing for premium tiers
- [ ] Lawful radiosonde (balloons) source adapter
- [ ] Radiation monitoring adapter (Safecast / EU networks)
- [ ] Expanded AIS maritime tracking
- [ ] Type tightening + unit test coverage
- [ ] Comms/collaboration features

> None of the above are implemented yet. Feature flags exist but default
> to `false`. Don't claim otherwise.

---

## 🙏 Attribution

AegisGrid is a fork of the upstream **Osiris** project by
[simplifaisoul](https://github.com/simplifaisoul). Upstream attribution
is preserved for license and history clarity. Active product branding,
repository identity, and ongoing development are AegisGrid.

---

*Built with ☕ and healthy paranoia.*
