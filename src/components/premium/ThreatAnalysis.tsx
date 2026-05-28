'use client';

import { useState } from 'react';
import { Shield, AlertTriangle, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ThreatResult {
  threatLevel: string;
  torExitNode: boolean;
  otxReputation: number;
  otxPulseCount: number;
  otxCountry: string;
  otxAsn: string;
}

export default function ThreatAnalysis() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ThreatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/osint/threats?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Lookup failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runCheck()}
          placeholder="IP, domain, or hash to analyze..."
          className="flex-1 bg-black/40 border border-[var(--border-primary)] rounded px-3 py-2 text-xs font-mono text-white placeholder:text-[var(--text-muted)]/40 focus:outline-none focus:border-[var(--gold-primary)]/50"
        />
        <button
          onClick={runCheck}
          disabled={loading || !query.trim()}
          className="px-4 py-2 rounded text-xs font-mono font-bold bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30 hover:bg-[var(--gold-primary)]/30 disabled:opacity-30 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'ANALYZE'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded border border-red-500/20 bg-red-500/5 text-xs font-mono text-red-400">
          <XCircle size={14} /> {error}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ThreatBadge label="THREAT LEVEL" value={result.threatLevel} color={result.threatLevel === 'LOW' ? '#76FF03' : result.threatLevel === 'MEDIUM' ? '#FF9500' : '#FF3D3D'} />
          <ThreatBadge label="TOR EXIT NODE" value={result.torExitNode ? 'YES' : 'NO'} color={result.torExitNode ? '#FF3D3D' : '#76FF03'} />
          <ThreatBadge label="OTX REPUTATION" value={String(result.otxReputation)} color={result.otxReputation > 0 ? '#FF3D3D' : '#76FF03'} />
          <ThreatBadge label="OTX PULSES" value={String(result.otxPulseCount)} color="#D4AF37" />
          <ThreatBadge label="COUNTRY" value={result.otxCountry || 'Unknown'} color="#00E5FF" />
          <ThreatBadge label="ASN" value={result.otxAsn || 'Unknown'} color="#00E5FF" />
        </div>
      )}

      {!result && !loading && !error && (
        <p className="text-xs font-mono text-[var(--text-muted)]/60 text-center py-4">
          Enter an IP, domain, or hash to run threat intelligence analysis.
        </p>
      )}
    </div>
  );
}

function ThreatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-[var(--border-primary)] rounded-lg p-3 text-center">
      <div className="text-[9px] font-mono text-[var(--text-muted)] tracking-wider mb-1">{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
