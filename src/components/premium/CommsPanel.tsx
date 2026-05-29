'use client';

import { useEffect, useState } from 'react';
import { Radio, Plane, Shield, Cloud, ExternalLink, Loader2, Play } from 'lucide-react';

interface CommsSource {
  id: string;
  name: string;
  category: string;
  region: string;
  country: string;
  url: string;
  embed_allowed: boolean;
  attribution: string;
  terms_note: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  weather_radio: <Cloud size={14} />,
  public_sdr: <Radio size={14} />,
  agency_briefing: <Shield size={14} />,
  aviation_audio: <Plane size={14} />,
};

const CATEGORY_LABELS: Record<string, string> = {
  weather_radio: 'Weather Radio',
  public_sdr: 'Public SDR',
  agency_briefing: 'Agency Briefing',
  aviation_audio: 'Aviation Audio',
};

export default function CommsPanel() {
  const [sources, setSources] = useState<CommsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/comms')
      .then(r => r.json())
      .then(d => setSources(d.sources || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 className="animate-spin" size={14} /> Loading comms...</div>;
  }

  const categories = ['all', ...new Set(sources.map(s => s.category))];
  const filtered = filter === 'all' ? sources : sources.filter(s => s.category === filter);

  if (sources.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">No comms sources available. Enable FEATURE_COMMS=true.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-2.5 py-1 rounded text-[9px] font-mono tracking-wider transition-colors ${
              filter === cat
                ? 'bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30'
                : 'bg-[var(--border-primary)] text-[var(--text-muted)] border border-transparent hover:text-white'
            }`}
          >
            {cat === 'all' ? 'ALL' : CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Source grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(source => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col p-3 rounded-lg border border-[var(--border-primary)] hover:border-[var(--cyan-primary)]/30 hover:bg-[var(--cyan-primary)]/5 transition-all group no-underline"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[var(--cyan-primary)]">
                  {CATEGORY_ICONS[source.category] || <Radio size={14} />}
                </span>
                <div>
                  <div className="text-[10px] font-mono font-bold text-white group-hover:text-[var(--cyan-primary)] transition-colors">
                    {source.name}
                  </div>
                  <div className="text-[8px] font-mono text-[var(--text-muted)]">
                    {source.region} · {CATEGORY_LABELS[source.category] || source.category}
                  </div>
                </div>
              </div>
              {source.embed_allowed ? (
                <span className="px-1.5 py-0.5 rounded text-[7px] font-mono bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                  <Play size={8} /> EMBED
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[7px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <ExternalLink size={8} /> LINK
                </span>
              )}
            </div>

            <div className="text-[9px] font-mono text-[var(--text-muted)]/70 leading-relaxed">
              {source.terms_note}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-primary)]">
              <span className="text-[7px] font-mono text-[var(--text-muted)]/50">{source.attribution}</span>
              <ExternalLink size={10} className="text-[var(--text-muted)] group-hover:text-white transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
