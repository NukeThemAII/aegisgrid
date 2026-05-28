'use client';

import { useState } from 'react';
import { Crown, Zap, X } from 'lucide-react';

export default function PremiumBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto">
      <div className="flex items-center gap-2 md:gap-4 px-4 py-2 rounded-lg border border-[var(--gold-primary)]/40 bg-black/90 backdrop-blur-md shadow-lg shadow-[var(--gold-primary)]/10">
        <Crown size={14} className="text-[var(--gold-primary)] shrink-0" />
        <span className="text-[10px] md:text-[11px] font-mono text-white tracking-wider">
          <span className="text-[var(--gold-primary)] font-bold">AEGISGRID PRO</span>
          {' '}— AI Reports · Advanced Scanning · x402 USDC Pay-Per-Use
        </span>
        <a
          href="/api/billing/checkout"
          onClick={(e) => { e.preventDefault(); fetch('/api/billing/checkout', { method: 'POST' }).then(r => r.json()).then(d => d.url && window.open(d.url, '_blank')); }}
          className="flex items-center gap-1 px-3 py-1 rounded text-[10px] font-mono font-bold bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 transition-colors shrink-0"
        >
          <Zap size={10} />
          UPGRADE
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--text-muted)] hover:text-white transition-colors ml-1"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
