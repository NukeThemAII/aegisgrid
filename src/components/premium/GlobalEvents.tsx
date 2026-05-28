'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, ExternalLink, MapPin } from 'lucide-react';

interface GeoEvent {
  id: string;
  lat: number;
  lng: number;
  name: string;
  url?: string;
  type?: string;
}

export default function GlobalEvents() {
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/gdelt')
      .then(r => r.json())
      .then(d => {
        const items = d.events || d.items || [];
        setEvents(items.slice(0, 15));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 className="animate-spin" size={14} /> Loading global events...</div>;
  }

  if (events.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">No global events available.</p>;
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto styled-scrollbar pr-1">
      {events.map((event, i) => (
        <a
          key={event.id || i}
          href={event.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 p-2.5 rounded-lg border border-[var(--border-primary)] hover:border-[var(--gold-primary)]/30 hover:bg-[var(--gold-primary)]/5 transition-all group no-underline"
        >
          <div className="p-1.5 rounded shrink-0 mt-0.5" style={{ background: 'rgba(0,229,255,0.1)', color: '#00E5FF' }}>
            <MapPin size={12} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-[var(--text-primary)] group-hover:text-white leading-relaxed line-clamp-2">
              {event.name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                {event.lat?.toFixed(1)}, {event.lng?.toFixed(1)}
              </span>
              {event.type && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[var(--border-primary)] text-[var(--text-muted)]">
                  {event.type}
                </span>
              )}
            </div>
          </div>
          <ExternalLink size={12} className="text-[var(--text-muted)] group-hover:text-white shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      ))}
    </div>
  );
}
