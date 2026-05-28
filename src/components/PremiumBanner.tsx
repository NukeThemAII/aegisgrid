'use client';

import { useState, useEffect } from 'react';
import { Crown, Zap, X } from 'lucide-react';

interface PremiumStatus {
  premium_enabled: boolean;
  features: {
    stripe: { configured: boolean };
    x402: { configured: boolean };
  };
  next_steps: string;
}

export default function PremiumBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<PremiumStatus | null>(null);

  useEffect(() => {
    fetch('/api/premium/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (dismissed || !status) return null;

  // If premium is fully configured, show the upgrade banner
  const stripeReady = status.features.stripe.configured;
  const anythingReady = stripeReady || status.features.x402.configured;

  // If nothing is configured, show a setup nudge instead
  if (!status.premium_enabled) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto">
        <div className="flex items-center gap-2 md:gap-3 px-3 py-1.5 rounded-lg border border-[var(--border-primary)] bg-black/90 backdrop-blur-md">
          <Crown size={12} className="text-[var(--text-muted)] shrink-0" />
          <span className="text-[9px] md:text-[10px] font-mono text-[var(--text-muted)]">
            Premium disabled — enable in .env.local to unlock Pro features
          </span>
          <button onClick={() => setDismissed(true)}
            className="text-[var(--text-muted)] hover:text-white transition-colors ml-1">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (!anythingReady) {
    // Premium enabled but no payment provider configured
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto">
        <div className="flex items-center gap-2 md:gap-3 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-black/90 backdrop-blur-md">
          <Crown size={12} className="text-amber-400 shrink-0" />
          <span className="text-[9px] md:text-[10px] font-mono text-amber-400">
            Premium enabled — configure Stripe or x402 to activate payments
          </span>
          <button onClick={() => setDismissed(true)}
            className="text-[var(--text-muted)] hover:text-white transition-colors ml-1">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Fully configured: show the gold CTA banner
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto">
      <div className="flex items-center gap-2 md:gap-4 px-4 py-2 rounded-lg border border-[var(--gold-primary)]/40 bg-black/90 backdrop-blur-md shadow-lg shadow-[var(--gold-primary)]/10">
        <Crown size={14} className="text-[var(--gold-primary)] shrink-0" />
        <span className="text-[10px] md:text-[11px] font-mono text-white tracking-wider">
          <span className="text-[var(--gold-primary)] font-bold">AEGISGRID PRO</span>
          {' '}— AI Reports · Advanced Scanning · x402 USDC Pay-Per-Use
        </span>
        <button
          onClick={() => {
            fetch('/api/billing/checkout', { method: 'POST' })
              .then(r => r.json())
              .then(d => d.url && window.open(d.url, '_blank'))
              .catch(() => {});
          }}
          className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-mono font-bold bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 transition-colors shrink-0"
        >
          <Zap size={10} />
          UPGRADE
        </button>
        <button onClick={() => setDismissed(true)}
          className="text-[var(--text-muted)] hover:text-white transition-colors ml-1">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
