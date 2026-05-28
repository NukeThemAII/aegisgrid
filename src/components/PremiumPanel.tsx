'use client';

import { useState, useEffect, useCallback } from 'react';
import { Crown, Zap, CreditCard, FileText, Shield, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface SessionInfo {
  authenticated: boolean;
  role: 'anonymous' | 'authenticated' | 'admin';
  subject_id?: string;
  entitlements: string[];
}

// ── Component ───────────────────────────────────────────────────────

export default function PremiumPanel() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/auth/session');
      if (!res.ok) throw new Error('Failed to fetch session');
      setSession(await res.json());
    } catch (e) {
      setError('Session unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else setError(data.error || 'Checkout failed');
    } catch {
      setError('Checkout request failed');
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePortal = async () => {
    setManagingBilling(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else setError(data.error || 'Portal unavailable');
    } catch {
      setError('Billing portal request failed');
    } finally {
      setManagingBilling(false);
    }
  };

  const handleAiReport = async () => {
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'situational_briefing' }),
      });
      const data = await res.json();
      if (data.report?.markdown) {
        // Open report in new tab as markdown blob
        const blob = new Blob([data.report.markdown], { type: 'text/markdown' });
        window.open(URL.createObjectURL(blob), '_blank');
      } else {
        setError(data.error || 'Report generation failed');
      }
    } catch {
      setError('Report request failed');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────

  const hasEntitlement = (cap: string) =>
    session?.entitlements?.includes('*') ||
    session?.entitlements?.includes('premium') ||
    session?.entitlements?.includes(cap);

  const isPro = hasEntitlement('pro') || hasEntitlement('premium');

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] font-mono">
          <Loader2 size={14} className="animate-spin" />
          LOADING PREMIUM...
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────

  if (error && !session) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 text-red-400 text-[11px] font-mono">
          <XCircle size={14} />
          {error}
        </div>
        <button onClick={fetchSession} className="mt-2 text-[10px] font-mono text-[var(--gold-primary)] hover:underline">
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-[var(--gold-primary)]" />
          <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-white">PREMIUM</span>
        </div>
        <div className="flex items-center gap-1.5">
          {session?.authenticated ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">
              <CheckCircle size={10} />
              {session.role === 'admin' ? 'ADMIN' : 'AUTHENTICATED'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--border-primary)] text-[var(--text-muted)]">
              ANONYMOUS
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-4 space-y-4">

        {/* ── Not authenticated ── */}
        {!session?.authenticated && (
          <div className="text-center py-3">
            <Shield size={20} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-[10px] font-mono text-[var(--text-muted)] mb-3 leading-relaxed">
              Sign in with GitHub to unlock premium features, AI reports, and paid API access.
            </p>
            <p className="text-[9px] font-mono text-[var(--gold-primary)]/60">
              Use the GitHub button in the top-right corner.
            </p>
          </div>
        )}

        {/* ── Authenticated ── */}
        {session?.authenticated && (
          <>
            {/* ── Current entitlements ── */}
            <div>
              <div className="text-[9px] font-mono text-[var(--text-muted)] tracking-widest mb-1.5">ENTITLEMENTS</div>
              <div className="flex flex-wrap gap-1">
                {session.entitlements.length > 0 ? (
                  session.entitlements.map((e) => (
                    <span key={e} className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] border border-[var(--gold-primary)]/20">
                      {e}
                    </span>
                  ))
                ) : (
                  <span className="text-[9px] font-mono text-[var(--text-muted)] italic">none</span>
                )}
              </div>
            </div>

            {/* ── Pro subscription (Stripe) ── */}
            <div className="rounded-lg border border-[var(--border-primary)] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-[var(--gold-primary)]" />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">PRO SUBSCRIPTION</span>
                {isPro && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">ACTIVE</span>}
              </div>
              <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                Full platform access, advanced OSINT lookups, AI reports, and priority feeds.
              </p>
              {!isPro ? (
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono font-bold tracking-wider bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 disabled:opacity-50 transition-all"
                >
                  {checkingOut ? <Loader2 size={12} className="animate-spin" /> : <Crown size={12} />}
                  {checkingOut ? 'REDIRECTING...' : 'UPGRADE TO PRO'}
                </button>
              ) : (
                <button
                  onClick={handlePortal}
                  disabled={managingBilling}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono tracking-wider border border-[var(--gold-primary)]/40 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/10 disabled:opacity-50 transition-all"
                >
                  {managingBilling ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  {managingBilling ? 'LOADING...' : 'MANAGE SUBSCRIPTION'}
                </button>
              )}
            </div>

            {/* ── AI Reports ── */}
            <div className="rounded-lg border border-[var(--border-primary)] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[var(--cyan-primary)]" />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">AI BRIEFING</span>
              </div>
              <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                Generate a situational-intelligence report from live feed data with source citations.
                {hasEntitlement('ai_reports') || isPro ? '' : ' Requires Pro subscription.'}
              </p>
              <button
                onClick={handleAiReport}
                disabled={!(hasEntitlement('ai_reports') || isPro)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono font-bold tracking-wider bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/30 hover:bg-[var(--cyan-primary)]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Zap size={12} />
                GENERATE REPORT
              </button>
            </div>

            {/* ── x402 Pay-Per-Use ── */}
            <div className="rounded-lg border border-[var(--border-primary)] p-3 space-y-2 opacity-60">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-purple-400" />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">PAY-PER-USE (x402)</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">USDC</span>
              </div>
              <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                Pay in USDC for individual AI reports or data enrichments via x402 protocol. No subscription needed.
              </p>
              <div className="text-[8px] font-mono text-[var(--text-muted)]/60">
                Configure X402_ENABLED=true to activate.
              </div>
            </div>
          </>
        )}

        {/* ── Error toast ── */}
        {error && (
          <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
            <span className="text-[10px] font-mono text-red-400">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
