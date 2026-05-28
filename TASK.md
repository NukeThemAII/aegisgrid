# AegisGrid Task Backlog

> Priority-ordered. Completed items show commit SHA.

---

## IN PROGRESS — Premium Dashboard (separate page)

### Premium Dashboard (`/premium`)
**Stack:** Next.js App Router + recharts (free MIT) + DeepSeek AI
**Goal:** Dedicated full-page premium hub with data-rich AI analysis,
charts/pies from live OSINT feeds, payment integration, and zero clutter.

**Sections:**
- AI Situational Briefing — DeepSeek-generated reports with charts
- Sensor Dashboard — live earthquake/fire/threat data as visualizations
- Threat Matrix — cyber threat indicators with severity gauges
- Account — auth status, entitlements, Stripe/x402 purchase flow

**Estimate:** ~3h

---

## HIGH — Completed

- [x] Feed route rate limiting — `b42beff`
- [x] Premium frontend panel — `fc36f78`
- [x] OsintPanel fixes — `ef2422e`
- [x] Scanner response sanitization — `b8852fe`
- [x] Premium status endpoint — `64ff477`
- [x] CSRF protection — `99837b8`
- [x] SSRF host-pinning — `581592f`
- [x] Radiation adapter (Safecast) — `b88124b`
- [x] AI providers (DeepSeek, Gemini) — `33f9a03`
- [x] Auth fix (no-db fallback) — `c9881da`
- [x] Balloons documented — `aa0b02d`
- [x] Auto-collect feeds for reports — `f10021a`
- [x] Report UX (inline display) — `dd66fef`
- [x] Component directory reorg — `54f1dd4`
- [x] Docker dedup — `33f9a03`

---

## REMAINING

- [ ] AIS maritime tracking
- [ ] Comms/collaboration features
- [x] pino structured logging
- [ ] OsintPanel refactor (825-line monolith)
- [ ] CSP nonces (AUDIT.md Rec #2)
- [ ] DB audit trails (AUDIT.md Rec #3)

---

## Credentials needed from operator

| Feature | Variables |
|---|---|
| Stripe Pro | STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTHLY |
| x402 USDC | X402_RECEIVING_ADDRESS |
| GitHub OAuth | AUTH_GITHUB_ID, AUTH_GITHUB_SECRET |

---

*Last updated: 2026-05-28*
