'use client';

import { useState, useEffect, useCallback } from 'react';
import { Crown, Zap, CreditCard, FileText, Shield, Loader2, CheckCircle, XCircle, ExternalLink, AlertTriangle, Settings } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface SessionInfo {
  authenticated: boolean;
  role: 'anonymous' | 'authenticated' | 'admin';
  subject_id?: string;
  entitlements: string[];
}

interface PremiumStatus {
  premium_enabled: boolean;
  features: {
    stripe: { configured: boolean; live_mode: boolean; missing: string[] };
    x402: { configured: boolean; missing: string[] };
    ai_reports: { configured: boolean; provider: string; missing: string[] };
  };
  infrastructure: { database: boolean; auth: boolean };
  next_steps: string;
}

// ── Component ───────────────────────────────────────────────────────

export default function PremiumPanel() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [managingBilling, setManagingBilling] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [sessRes, statRes] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/premium/status'),
      ]);
      if (sessRes.ok) setSession(await sessRes.json());
      if (statRes.ok) setStatus(await statRes.json());
    } catch {
      setError('Status check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else setError(data.error || 'Checkout unavailable');
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
  const stripeReady = status?.features.stripe.configured ?? false;
  const x402Ready = status?.features.x402.configured ?? false;
  const aiReady = status?.features.ai_reports.configured ?? false;
  const premiumEnabled = status?.premium_enabled ?? false;
  const anythingConfigured = stripeReady || x402Ready || aiReady;

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] font-mono">
          <Loader2 size={14} className="animate-spin" />
          LOADING...
        </div>
      </div>
    );
  }

  // ── Nothing configured ────────────────────────────────────────────

  if (!premiumEnabled && !anythingConfigured) {
    return (
      <div className="glass-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center gap-2">
          <Crown size={14} className="text-[var(--gold-primary)]" />
          <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-white">PREMIUM</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-mono text-amber-400 font-bold mb-1">NOT CONFIGURED</p>
              <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                Premium features are disabled. Set <code className="text-[var(--gold-primary)]">FEATURE_PREMIUM=true</code> in
                .env.local, then configure Stripe or x402 to enable payments.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSetup(!showSetup)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <Settings size={12} />
            {showSetup ? 'HIDE SETUP GUIDE' : 'SHOW SETUP GUIDE'}
          </button>
          {showSetup && <SetupGuide />}
        </div>
      </div>
    );
  }

  // ── Authenticated premium panel ───────────────────────────────────

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
              {session.role === 'admin' ? 'ADMIN' : 'AUTH'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--border-primary)] text-[var(--text-muted)]">
              ANON
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Not authenticated ── */}
        {!session?.authenticated && (
          <div className="text-center py-3">
            <Shield size={20} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-[10px] font-mono text-[var(--text-muted)] mb-2">
              Sign in to unlock premium features.
            </p>
            <p className="text-[9px] font-mono text-[var(--gold-primary)]/60">
              Use GitHub button (top-right) or configure AUTH_USER_TOKENS.
            </p>
          </div>
        )}

        {/* ── Authenticated ── */}
        {session?.authenticated && (
          <>
            {/* ── Entitlements ── */}
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
                  <span className="text-[9px] font-mono text-[var(--text-muted)] italic">none — subscribe to get entitlements</span>
                )}
              </div>
            </div>

            {/* ── Stripe Pro ── */}
            <div className={`rounded-lg border p-3 space-y-2 ${stripeReady ? 'border-[var(--gold-primary)]/30' : 'border-[var(--border-primary)] opacity-60'}`}>
              <div className="flex items-center gap-2">
                <CreditCard size={14} className={stripeReady ? 'text-[var(--gold-primary)]' : 'text-[var(--text-muted)]'} />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">PRO SUBSCRIPTION</span>
                {isPro && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">ACTIVE</span>}
                {!stripeReady && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">NEEDS KEY</span>}
              </div>
              {stripeReady ? (
                <>
                  <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                    Full platform access, advanced OSINT, AI reports, priority feeds.
                  </p>
                  {!isPro ? (
                    <button onClick={handleCheckout} disabled={checkingOut}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono font-bold tracking-wider bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 disabled:opacity-50 transition-all">
                      {checkingOut ? <Loader2 size={12} className="animate-spin" /> : <Crown size={12} />}
                      {checkingOut ? 'REDIRECTING...' : 'UPGRADE TO PRO'}
                    </button>
                  ) : (
                    <button onClick={handlePortal} disabled={managingBilling}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono tracking-wider border border-[var(--gold-primary)]/40 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/10 disabled:opacity-50 transition-all">
                      {managingBilling ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                      {managingBilling ? 'LOADING...' : 'MANAGE SUBSCRIPTION'}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-[9px] font-mono text-[var(--text-muted)]/60 leading-relaxed">
                  Stripe not configured. Add STRIPE_SECRET_KEY + price IDs to .env.local.
                </p>
              )}
            </div>

            {/* ── AI Reports ── */}
            <div className={`rounded-lg border p-3 space-y-2 ${aiReady ? 'border-[var(--cyan-primary)]/30' : 'border-[var(--border-primary)] opacity-60'}`}>
              <div className="flex items-center gap-2">
                <FileText size={14} className={aiReady ? 'text-[var(--cyan-primary)]' : 'text-[var(--text-muted)]'} />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">AI BRIEFING</span>
                {aiReady && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{status?.features.ai_reports.provider}</span>}
              </div>
              {aiReady ? (
                <>
                  <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                    Situational-intelligence report from live feeds with citations.
                  </p>
                  <button onClick={handleAiReport} disabled={!(hasEntitlement('ai_reports') || isPro)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[10px] font-mono font-bold tracking-wider bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/30 hover:bg-[var(--cyan-primary)]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <Zap size={12} />
                    GENERATE REPORT
                  </button>
                </>
              ) : (
                <p className="text-[9px] font-mono text-[var(--text-muted)]/60 leading-relaxed">
                  Set AI_PROVIDER=deterministic and FEATURE_AI_REPORTS=true to enable.
                </p>
              )}
            </div>

            {/* ── x402 USDC ── */}
            <div className={`rounded-lg border p-3 space-y-2 ${x402Ready ? 'border-purple-500/30' : 'border-[var(--border-primary)] opacity-60'}`}>
              <div className="flex items-center gap-2">
                <Zap size={14} className={x402Ready ? 'text-purple-400' : 'text-[var(--text-muted)]'} />
                <span className="text-[10px] font-mono font-bold text-white tracking-wider">PAY-PER-USE</span>
                {x402Ready && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">USDC</span>}
                {!x402Ready && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">NEEDS KEY</span>}
              </div>
              {x402Ready ? (
                <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                  Pay in USDC for individual reports or data enrichments via x402.
                </p>
              ) : (
                <p className="text-[9px] font-mono text-[var(--text-muted)]/60 leading-relaxed">
                  Set X402_ENABLED=true, X402_RECEIVING_ADDRESS, and X402_FACILITATOR_URL.
                </p>
              )}
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

        {/* ── Setup guide toggle ── */}
        <button onClick={() => setShowSetup(!showSetup)}
          className="w-full flex items-center justify-center gap-1 text-[9px] font-mono text-[var(--text-muted)]/50 hover:text-[var(--text-muted)] transition-colors">
          <Settings size={10} />
          {showSetup ? 'HIDE SETUP' : 'SETUP GUIDE'}
        </button>
        {showSetup && <SetupGuide />}
      </div>
    </div>
  );
}

// ── Setup Guide ─────────────────────────────────────────────────────

function SetupGuide() {
  return (
    <div className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 space-y-3 text-[9px] font-mono text-[var(--text-muted)]">
      <div className="text-[var(--gold-primary)] font-bold tracking-wider text-[10px]">PREMIUM SETUP</div>

      <div>
        <div className="text-white font-bold mb-1">1. Enable Premium</div>
        <code className="text-[var(--cyan-primary)]">FEATURE_PREMIUM=true</code>
        <span className="block mt-0.5">in .env.local, restart server</span>
      </div>

      <div>
        <div className="text-white font-bold mb-1">2. Stripe Payments</div>
        <div className="space-y-0.5">
          <div><code className="text-[var(--cyan-primary)]">STRIPE_SECRET_KEY=sk_live_...</code></div>
          <div><code className="text-[var(--cyan-primary)]">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...</code></div>
          <div><code className="text-[var(--cyan-primary)]">STRIPE_WEBHOOK_SECRET=whsec_...</code></div>
          <div><code className="text-[var(--cyan-primary)]">STRIPE_PRICE_PRO_MONTHLY=price_...</code></div>
        </div>
      </div>

      <div>
        <div className="text-white font-bold mb-1">3. x402 USDC (optional)</div>
        <div className="space-y-0.5">
          <div><code className="text-[var(--cyan-primary)]">X402_ENABLED=true</code></div>
          <div><code className="text-[var(--cyan-primary)]">X402_RECEIVING_ADDRESS=0x...</code></div>
          <div><code className="text-[var(--cyan-primary)]">X402_FACILITATOR_URL=https://...</code></div>
        </div>
      </div>

      <div>
        <div className="text-white font-bold mb-1">4. AI Reports</div>
        <div className="space-y-0.5">
          <div><code className="text-[var(--cyan-primary)]">FEATURE_AI_REPORTS=true</code></div>
          <div><code className="text-[var(--cyan-primary)]">AI_PROVIDER=deterministic</code></div>
          <div>or OpenAI: <code className="text-[var(--cyan-primary)]">AI_PROVIDER=openai</code> + <code className="text-[var(--cyan-primary)]">OPENAI_API_KEY=sk-...</code></div>
        </div>
      </div>
    </div>
  );
}
