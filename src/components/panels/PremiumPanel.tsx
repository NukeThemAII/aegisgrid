'use client';

import { useState, useEffect } from 'react';
import { Crown, ArrowRight, Shield, Loader2 } from 'lucide-react';

export default function PremiumPanel() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('aegisgrid_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/auth/session', { headers })
      .then(r => r.json())
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div className="glass-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-[var(--gold-primary)]" />
          <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-white">PREMIUM</span>
        </div>
        {session?.authenticated && (
          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">
            PRO
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Token input for quick auth */}
        {!session?.authenticated && (
          <div className="flex gap-1">
            <input
              type="password"
              placeholder="API token..."
              className="flex-1 bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded px-2 py-1.5 text-[10px] font-mono text-white placeholder:text-[var(--text-muted)]/40 focus:outline-none focus:border-[var(--gold-primary)]/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    localStorage.setItem('aegisgrid_token', val);
                    window.location.reload();
                  }
                }
              }}
            />
          </div>
        )}

        {/* Quick actions linking to full dashboard */}
        <a
          href="/premium"
          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/5 hover:bg-[var(--gold-primary)]/10 transition-all group no-underline"
        >
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-[var(--gold-primary)]" />
            <div>
              <div className="text-[10px] font-mono font-bold text-white">PREMIUM DASHBOARD</div>
              <div className="text-[8px] font-mono text-[var(--text-muted)]">AI Analysis · Charts · Threat Intel</div>
            </div>
          </div>
          <ArrowRight size={14} className="text-[var(--gold-primary)] group-hover:translate-x-1 transition-transform" />
        </a>

        <a
          href="/premium"
          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[var(--cyan-primary)]/30 bg-[var(--cyan-primary)]/5 hover:bg-[var(--cyan-primary)]/10 transition-all group no-underline"
        >
          <div className="flex items-center gap-2">
            <ArrowRight size={14} className="text-[var(--cyan-primary)]" />
            <div>
              <div className="text-[10px] font-mono font-bold text-white">GENERATE AI REPORT</div>
              <div className="text-[8px] font-mono text-[var(--text-muted)]">DeepSeek-powered intelligence</div>
            </div>
          </div>
          <ArrowRight size={14} className="text-[var(--cyan-primary)] group-hover:translate-x-1 transition-transform" />
        </a>

        {session?.entitlements?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {session.entitlements.map((e: string) => (
              <span key={e} className="px-2 py-0.5 rounded text-[8px] font-mono bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] border border-[var(--gold-primary)]/20">
                {e}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
