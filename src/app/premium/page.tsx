'use client';

import { useState, useEffect } from 'react';
import { Crown, Zap, Shield, Activity, BarChart3, ArrowLeft, Globe, Radio, Lock, CreditCard, Loader2, CheckCircle } from 'lucide-react';
import SensorCharts from '@/components/premium/SensorCharts';
import AiAnalysis from '@/components/premium/AiAnalysis';
import ThreatAnalysis from '@/components/premium/ThreatAnalysis';
import GlobalEvents from '@/components/premium/GlobalEvents';
import CommsPanel from '@/components/premium/CommsPanel';

interface AccessState {
  granted: boolean;
  source?: string;
  role?: string;
  entitlements?: string[];
  reason?: string;
  paymentOptions?: { stripeEnabled: boolean; x402Enabled: boolean };
}

export default function PremiumPage() {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');

  const checkAccess = async (accessToken?: string) => {
    setLoading(true);
    try {
      const t = accessToken || localStorage.getItem('aegisgrid_token');
      const headers: Record<string, string> = {};
      if (t) headers['Authorization'] = `Bearer ${t}`;

      const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';
      const res = await fetch(`/api/premium/access${tokenParam}`, { headers });
      setAccess(await res.json());
    } catch {
      setAccess({ granted: false, reason: 'network_error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkAccess(); }, []);

  const handleTokenSubmit = () => {
    const t = tokenInput.trim();
    if (!t) return;
    // Try as bearer token first
    localStorage.setItem('aegisgrid_token', t);
    checkAccess();
    // Also try as access token
    if (t.includes('.')) {
      checkAccess();
    }
  };

  const handleStripeCheckout = async () => {
    const t = localStorage.getItem('aegisgrid_token');
    const headers: Record<string, string> = {};
    if (t) headers['Authorization'] = `Bearer ${t}`;
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST', headers });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setTokenError(data.error || 'Checkout unavailable — Stripe not configured');
    } catch {
      setTokenError('Checkout request failed');
    }
  };

  const handleBuyDayPass = async () => {
    const t = localStorage.getItem('aegisgrid_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (t) headers['Authorization'] = `Bearer ${t}`;
    try {
      const res = await fetch('/api/premium/purchase', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tier: 'day_pass' }),
      });
      const data = await res.json();
      if (data.token) {
        window.location.href = `/premium?token=${encodeURIComponent(data.token)}`;
      } else {
        setTokenError(data.error || 'Purchase failed');
      }
    } catch {
      setTokenError('Purchase request failed');
    }
  };

  // Loading
  if (loading || !access) {
    return (
      <div className="min-h-screen bg-[var(--bg-void)] flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--gold-primary)]" size={32} />
      </div>
    );
  }

  // LOCKED — show payment/purchase options
  if (!access.granted) {
    const stripeOk = access.paymentOptions?.stripeEnabled;
    const x402Ok = access.paymentOptions?.x402Enabled;

    return (
      <div className="min-h-screen bg-[var(--bg-void)] flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          {/* Header */}
          <div className="text-center">
            <Lock size={48} className="mx-auto mb-4 text-[var(--gold-primary)]" />
            <h1 className="text-2xl font-mono font-bold text-white mb-2">PREMIUM ACCESS</h1>
            <p className="text-sm font-mono text-[var(--text-muted)]">
              Authenticate to unlock AI analysis, sensor dashboards, threat intelligence, and more.
            </p>
          </div>

          {/* API Token Auth */}
          <div className="border border-[var(--border-primary)] rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-mono font-bold text-white tracking-wider">API TOKEN</h3>
            <div className="flex gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTokenSubmit()}
                placeholder="Paste your API token..."
                className="flex-1 bg-black/40 border border-[var(--border-primary)] rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-[var(--text-muted)]/40 focus:outline-none focus:border-[var(--gold-primary)]/50"
              />
              <button onClick={handleTokenSubmit}
                className="px-6 py-2.5 rounded-lg text-sm font-mono font-bold bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30 hover:bg-[var(--gold-primary)]/30 transition-all">
                AUTH
              </button>
            </div>
          </div>

          {/* Payment Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buy Day Pass (always available) */}
            <div className="border border-[var(--cyan-primary)]/30 bg-[var(--cyan-primary)]/5 rounded-xl p-5 text-center space-y-3">
              <Zap size={28} className="mx-auto text-[var(--cyan-primary)]" />
              <h3 className="text-sm font-mono font-bold text-white">DAY PASS</h3>
              <p className="text-xs font-mono text-[var(--text-muted)]">24-hour premium access with AI reports</p>
              <button onClick={handleBuyDayPass}
                className="w-full py-2.5 rounded-lg text-xs font-mono font-bold bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/30 hover:bg-[var(--cyan-primary)]/30 transition-all">
                BUY DAY PASS
              </button>
            </div>

            {/* Stripe */}
            <div className={`border rounded-xl p-5 text-center space-y-3 ${stripeOk ? 'border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/5' : 'border-[var(--border-primary)] opacity-50'}`}>
              <CreditCard size={28} className="mx-auto text-[var(--gold-primary)]" />
              <h3 className="text-sm font-mono font-bold text-white">STRIPE</h3>
              <p className="text-xs font-mono text-[var(--text-muted)]">Monthly subscription with credit card</p>
              <button onClick={handleStripeCheckout} disabled={!stripeOk}
                className="w-full py-2.5 rounded-lg text-xs font-mono font-bold bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 disabled:opacity-30 transition-all">
                {stripeOk ? 'SUBSCRIBE' : 'NOT CONFIGURED'}
              </button>
            </div>
          </div>

          {/* x402 row */}
          {x402Ok && (
            <div className="border border-purple-500/30 bg-purple-500/5 rounded-xl p-5 text-center space-y-3">
              <Zap size={24} className="mx-auto text-purple-400" />
              <h3 className="text-sm font-mono font-bold text-white">x402 USDC PAY-PER-USE</h3>
              <p className="text-xs font-mono text-[var(--text-muted)]">Pay in USDC on Base. Purchase tokens via x402 protocol.</p>
              <button onClick={handleBuyDayPass}
                className="w-full py-2.5 rounded-lg text-xs font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all">
                BUY WITH USDC
              </button>
            </div>
          )}

          {tokenError && (
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-xs font-mono text-red-400 text-center">
              {tokenError}
            </div>
          )}

          <div className="text-center">
            <a href="/" className="text-xs font-mono text-[var(--text-muted)] hover:text-white transition-colors">
              ← Back to Map
            </a>
          </div>
        </div>
      </div>
    );
  }

  // UNLOCKED — full premium dashboard
  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-white">
      <header className="border-b border-[var(--border-primary)] bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 text-[var(--text-muted)] hover:text-white transition-colors">
              <ArrowLeft size={16} />
              <span className="text-xs font-mono tracking-wider hidden md:inline">BACK TO MAP</span>
            </a>
            <div className="w-px h-5 bg-[var(--border-primary)]" />
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-[var(--gold-primary)]" />
              <span className="text-sm font-mono font-bold tracking-[0.3em] text-[var(--gold-primary)]">PREMIUM</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono bg-green-500/10 text-green-400 border border-green-500/20">
              <CheckCircle size={12} />
              {access.source === 'access_token' ? 'DAY PASS' : access.role?.toUpperCase() || 'PRO'}
            </span>
            {access.entitlements && access.entitlements.length > 0 && (
              <div className="hidden md:flex gap-1">
                {access.entitlements.map((e: string) => (
                  <span key={e} className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] border border-[var(--gold-primary)]/20">{e}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* AI Analysis */}
        <section className="border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-[var(--cyan-primary)]" />
            <h2 className="text-sm font-mono font-bold tracking-wider text-white">AI SITUATIONAL ANALYSIS</h2>
            <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">DeepSeek-powered</span>
          </div>
          <AiAnalysis />
        </section>

        {/* Sensor Dashboard */}
        <section className="border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-[var(--gold-primary)]" />
            <h2 className="text-sm font-mono font-bold tracking-wider text-white">LIVE SENSOR DASHBOARD</h2>
          </div>
          <SensorCharts />
        </section>

        {/* Threat Intelligence */}
        <section className="border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-[#FF9500]" />
            <h2 className="text-sm font-mono font-bold tracking-wider text-white">THREAT INTELLIGENCE</h2>
            <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">OTX · Tor · Reputation</span>
          </div>
          <ThreatAnalysis />
        </section>

        {/* Global Events */}
        <section className="border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} className="text-[#00E5FF]" />
            <h2 className="text-sm font-mono font-bold tracking-wider text-white">GLOBAL EVENTS</h2>
          </div>
          <GlobalEvents />
        </section>

        {/* Comms */}
        <section className="border border-[var(--border-primary)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Radio size={18} className="text-[#76FF03]" />
            <h2 className="text-sm font-mono font-bold tracking-wider text-white">COMMS & LIVE FEEDS</h2>
          </div>
          <CommsPanel />
        </section>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickCard icon={<BarChart3 size={18} />} title="AI REPORTS" value="Unlimited" sub="with Pro subscription" color="#D4AF37" />
          <QuickCard icon={<Activity size={18} />} title="SENSOR FEEDS" value="15+" sub="earthquakes, fires, threats, more" color="#00E5FF" />
          <QuickCard icon={<Shield size={18} />} title="API ACCESS" value="REST" sub="bearer token authentication" color="#76FF03" />
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon, title, value, sub, color }: { icon: React.ReactNode; title: string; value: string; sub: string; color: string }) {
  return (
    <div className="border border-[var(--border-primary)] rounded-lg p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg shrink-0" style={{ background: `${color}15`, color }}>{icon}</div>
      <div>
        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wider">{title}</div>
        <div className="text-lg font-mono font-bold text-white">{value}</div>
        <div className="text-[9px] font-mono text-[var(--text-muted)]/60">{sub}</div>
      </div>
    </div>
  );
}
