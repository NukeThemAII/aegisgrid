# AegisGrid — Operator TODO

> What you need to do on your side to activate paid features.

---

## Step 1: Get Stripe API Keys (credit card payments)

1. Go to https://dashboard.stripe.com
2. Create account or log in
3. Go to Developers → API Keys
4. Copy your keys:

```
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
```

5. Go to Developers → Webhooks → Add Endpoint
   - URL: `http://94.16.122.69:3004/api/billing/webhook`
   - Events: `checkout.session.completed`
   - Copy the signing secret:
```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

6. Go to Products → Create Product
   - Name: "AegisGrid Pro"
   - Price: Monthly subscription, set your price
   - Copy the Price ID:
```
STRIPE_PRICE_PRO_MONTHLY=price_xxxxxxxxxxxx
```

7. Add all keys to `.env.local`:
```bash
nano /home/xaos/aegisgrid/.env.local
```

---

## Step 2: Get x402 USDC Address (crypto payments)

1. Create a wallet on Base network (Coinbase Wallet or MetaMask)
2. Add USDC on Base (buy or bridge from another chain)
3. Copy your wallet address (starts with 0x):
```
X402_RECEIVING_ADDRESS=0xYourWalletAddressHere
```

4. Facilitator is already configured (free Dexter):
```
X402_FACILITATOR_URL=https://dexter.cash/facilitator
X402_ENABLED=true
```

---

## Step 3: Get GitHub OAuth Keys (social login)

1. Go to https://github.com/settings/developers
2. New OAuth App
   - Name: AegisGrid
   - Homepage URL: http://94.16.122.69:3004
   - Callback URL: http://94.16.122.69:3004/api/auth/callback/github
3. Copy Client ID and generate Client Secret:
```
AUTH_GITHUB_ID=Ov23li...
AUTH_GITHUB_SECRET=...
```

---

## Step 4: Restart the app

After adding keys to `.env.local`:
```bash
cd /home/xaos/aegisgrid
fuser -k 3004/tcp
npm run build
npx next start -p 3004 -H 0.0.0.0
```

---

## How the paywall works (already built)

| User visits /premium | What they see |
|---|---|
| No token, no auth | Lock screen with BUY DAY PASS / STRIPE / x402 buttons |
| Pastes API token | Full dashboard unlocked |
| Clicks BUY DAY PASS | Calls /api/premium/purchase → gets 24h access token → auto-redirects |
| Clicks STRIPE SUBSCRIBE | Redirects to Stripe Checkout → pays → webhook grants 30-day token |
| Clicks x402 BUY WITH USDC | Calls purchase endpoint → gets token → dashboard unlocked |

**Test token:** `test-token-abc` (paste on lock screen to test dashboard)

---

## Payment feature flags

In `.env.local` you control what's available:

```env
FEATURE_PREMIUM=true     # Master switch — must be true
FEATURE_STRIPE=true      # Show Stripe option
FEATURE_X402=true        # Show x402 USDC option
```

Toggle any combination. Each works independently.

---

## Current credentials already in .env.local

- DeepSeek API key (for AI reports)
- Gemini API key (fallback)
- Redis URL (for caching)
- Test auth tokens

---

## Questions?

Ask Hermes to check status: `curl http://94.16.122.69:3004/api/premium/status`
