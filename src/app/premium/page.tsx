'use client';

import { useState, useEffect } from 'react';
import { Crown, Zap, Shield, Activity, BarChart3, ArrowLeft, Globe } from 'lucide-react';
import SensorCharts from '@/components/premium/SensorCharts';
import AiAnalysis from '@/components/premium/AiAnalysis';
import ThreatAnalysis from '@/components/premium/ThreatAnalysis';
import GlobalEvents from '@/components/premium/GlobalEvents';

export default function PremiumPage() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'billing'>('dashboard');

  useEffect(() => {
    const token = localStorage.getItem('aegisgrid_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/auth/session', { headers })
      .then(r => r.json())
      .then(setSession)
      .catch(() => {});
  }, []);

  const isAuthenticated = session?.authenticated;

  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-white">
      {/* ── Header ── */}
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
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider transition-colors ${activeTab === 'dashboard' ? 'bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30' : 'text-[var(--text-muted)] hover:text-white'}`}
            >
              DASHBOARD
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider transition-colors ${activeTab === 'billing' ? 'bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30' : 'text-[var(--text-muted)] hover:text-white'}`}
            >
              BILLING
            </button>

            {isAuthenticated ? (
              <span className="px-2 py-1 rounded text-xs font-mono bg-green-500/10 text-green-400 border border-green-500/20">
                {session?.role === 'admin' ? 'ADMIN' : 'PRO'}
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="password"
                  placeholder="Token"
                  className="w-32 bg-black/40 border border-[var(--border-primary)] rounded px-2 py-1 text-xs font-mono text-white placeholder:text-[var(--text-muted)]/40 focus:outline-none focus:border-[var(--gold-primary)]/50"
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
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* ── Hero ── */}
            {!isAuthenticated && (
              <div className="border border-[var(--gold-primary)]/30 rounded-xl p-6 text-center bg-[var(--gold-primary)]/5">
                <Crown size={32} className="mx-auto mb-3 text-[var(--gold-primary)]" />
                <h2 className="text-lg font-mono font-bold text-white mb-2">UNLOCK PREMIUM INTELLIGENCE</h2>
                <p className="text-sm font-mono text-[var(--text-muted)] mb-4 max-w-md mx-auto">
                  AI-powered OSINT analysis, real-time sensor dashboards, threat intelligence, and premium API access.
                </p>
                <p className="text-xs font-mono text-[var(--text-muted)]/60">
                  Paste your API token above or sign in with GitHub (top-right on main page).
                </p>
              </div>
            )}

            {/* ── AI Analysis ── */}
            <section className="border border-[var(--border-primary)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-[var(--cyan-primary)]" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-white">AI SITUATIONAL ANALYSIS</h2>
                <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">DeepSeek-powered</span>
              </div>
              <AiAnalysis />
            </section>

            {/* ── Sensor Dashboard ── */}
            <section className="border border-[var(--border-primary)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-[var(--gold-primary)]" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-white">LIVE SENSOR DASHBOARD</h2>
                <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">Real-time OSINT feeds</span>
              </div>
              <SensorCharts />
            </section>

            {/* ── Threat Intelligence ── */}
            <section className="border border-[var(--border-primary)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-[#FF9500]" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-white">THREAT INTELLIGENCE</h2>
                <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">OTX · Tor · Reputation</span>
              </div>
              <ThreatAnalysis />
            </section>

            {/* ── Global Events ── */}
            <section className="border border-[var(--border-primary)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={18} className="text-[#00E5FF]" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-white">GLOBAL EVENTS</h2>
                <span className="text-[9px] font-mono text-[var(--text-muted)] ml-2">GDELT · Live News</span>
              </div>
              <GlobalEvents />
            </section>

            {/* ── Quick Stats ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <QuickCard icon={<BarChart3 size={18} />} title="AI REPORTS" value="Unlimited" sub="with Pro subscription" color="#D4AF37" />
              <QuickCard icon={<Activity size={18} />} title="SENSOR FEEDS" value="15+" sub="earthquakes, fires, threats, more" color="#00E5FF" />
              <QuickCard icon={<Shield size={18} />} title="API ACCESS" value="REST" sub="bearer token authentication" color="#76FF03" />
            </div>
          </div>
        )}

        {/* ── Billing Tab ── */}
        {activeTab === 'billing' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="border border-[var(--gold-primary)]/30 rounded-xl p-6 bg-[var(--gold-primary)]/5 text-center">
              <Crown size={32} className="mx-auto mb-3 text-[var(--gold-primary)]" />
              <h2 className="text-lg font-mono font-bold text-white mb-2">AEGISGRID PRO</h2>
              <p className="text-sm font-mono text-[var(--text-muted)] mb-4">
                Full platform access: AI reports, advanced OSINT lookups, real-time sensor dashboards, premium API.
              </p>
              <div className="text-3xl font-mono font-bold text-[var(--gold-primary)] mb-1">$XX<span className="text-sm text-[var(--text-muted)]">/month</span></div>
              <p className="text-xs font-mono text-[var(--text-muted)]/60 mb-4">Configure STRIPE_SECRET_KEY to set price</p>
              <button
                onClick={() => {
                  const token = localStorage.getItem('aegisgrid_token');
                  fetch('/api/billing/checkout', {
                    method: 'POST',
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  }).then(r => r.json()).then(d => d.url && (window.location.href = d.url));
                }}
                className="px-8 py-3 rounded text-sm font-mono font-bold bg-[var(--gold-primary)] text-black hover:bg-[var(--gold-primary)]/90 transition-all"
              >
                SUBSCRIBE WITH STRIPE
              </button>
            </div>

            <div className="border border-purple-500/30 rounded-xl p-6 bg-purple-500/5 text-center">
              <Zap size={24} className="mx-auto mb-2 text-purple-400" />
              <h3 className="text-sm font-mono font-bold text-white mb-2">x402 USDC PAY-PER-USE</h3>
              <p className="text-xs font-mono text-[var(--text-muted)] mb-3">
                Pay in USDC for individual reports. No subscription. Facilitator: dexter.cash (free tier).
              </p>
              <p className="text-xs font-mono text-[var(--text-muted)]/60">
                Set X402_RECEIVING_ADDRESS to activate.
              </p>
            </div>
          </div>
        )}
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
