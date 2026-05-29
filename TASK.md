# AegisGrid Task Backlog

> All HIGH priority tasks complete. Remaining items need external deps.

---

## COMPLETED (all commits on master)

- [x] Feed route rate limiting — `b42beff`
- [x] Premium frontend panel — `fc36f78`
- [x] OsintPanel fixes — `ef2422e`
- [x] Scanner response sanitization — `b8852fe`
- [x] Premium status endpoint — `64ff477`
- [x] CSRF protection — `99837b8`
- [x] SSRF host-pinning — `581592f`
- [x] Radiation adapter (Safecast) — `b88124b`
- [x] AI providers (DeepSeek/Gemini) — `33f9a03`
- [x] Auth fix (no-db fallback) — `c9881da`
- [x] Balloons documented — `aa0b02d`
- [x] Auto-collect feeds for reports — `f10021a`
- [x] Report UX (inline display) — `dd66fef`
- [x] Component directory reorg — `54f1dd4`
- [x] Premium dashboard page — `9661609`
- [x] Threat analysis widget — `c9cf0e8`
- [x] Global events (GDELT) — `a73b21f`
- [x] pino structured logging — `3a91a12`
- [x] OsintPanel 834→253 line refactor — `c9263f9` (AGY)
- [x] Comms & live feeds — `dfcb55a`

## BLOCKED — needs external credentials

| Task | Blocker |
|---|---|
| Stripe payments | STRIPE_SECRET_KEY + price IDs |
| x402 USDC payments | X402_RECEIVING_ADDRESS |
| GitHub OAuth login | AUTH_GITHUB_ID + AUTH_GITHUB_SECRET |
| AIS maritime tracking | AISSTREAM_API_KEY (free at aisstream.io) |
| DB audit trails | DATABASE_URL (Postgres) |

## LOW — optional hardening

- [ ] CSP nonces — complex for Next.js 16, current CSP is already strict
- [ ] More comms sources — add regional SDR/ATC as needed

---

*Last updated: 2026-05-29*
