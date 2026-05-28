'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2, Activity, Flame, Shield, Satellite } from 'lucide-react';

interface SensorData {
  earthquakes: number;
  topQuakes: { magnitude: number; place: string }[];
  fires: number;
  threats: number;
  spaceEvents: number;
  flights: number;
  satellites: number;
}

const COLORS = ['#D4AF37', '#FF3D3D', '#FF9500', '#00E5FF', '#76FF03'];

export default function SensorCharts() {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [eq, fires, threats, sw] = await Promise.all([
          fetch('/api/earthquakes').then(r => r.json()),
          fetch('/api/fires').then(r => r.json()),
          fetch('/api/cyber-threats').then(r => r.json()),
          fetch('/api/space-weather').then(r => r.json()),
        ]);

        const topQuakes = (eq.earthquakes || [])
          .sort((a: any, b: any) => b.magnitude - a.magnitude)
          .slice(0, 10)
          .map((q: any) => ({ magnitude: q.magnitude, place: q.place }));

        setData({
          earthquakes: eq.earthquakes?.length || 0,
          topQuakes,
          fires: fires.fires?.length || 0,
          threats: threats.threats?.length || threats.indicators?.length || 0,
          spaceEvents: sw.events?.length || 0,
          flights: 0,
          satellites: 0,
        });
      } catch { /* feeds unavailable */ }
      finally { setLoading(false); }
    }
    fetchAll();
  }, []);

  if (loading) {
    return <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 className="animate-spin" size={16} /> Loading sensor data...</div>;
  }

  if (!data) return <div className="text-[var(--text-muted)] text-sm">Sensor data unavailable.</div>;

  const pieData = [
    { name: 'Earthquakes', value: data.earthquakes, icon: '🌍' },
    { name: 'Fires', value: data.fires, icon: '🔥' },
    { name: 'Threats', value: data.threats, icon: '🛡️' },
    { name: 'Space', value: data.spaceEvents, icon: '🛰️' },
  ].filter(d => d.value > 0);

  const barData = data.topQuakes.map(q => ({
    name: q.place.length > 25 ? q.place.slice(0, 25) + '...' : q.place,
    magnitude: q.magnitude,
  }));

  return (
    <div className="space-y-6">
      {/* ── SummaryCards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Activity size={18} />} label="Earthquakes" value={data.earthquakes} color="#FF3D3D" />
        <StatCard icon={<Flame size={18} />} label="Active Fires" value={data.fires} color="#FF9500" />
        <StatCard icon={<Shield size={18} />} label="Threats" value={data.threats} color="#D4AF37" />
        <StatCard icon={<Satellite size={18} />} label="Space Events" value={data.spaceEvents} color="#00E5FF" />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Earthquakes Bar Chart */}
        <div className="border border-[var(--border-primary)] rounded-lg p-4">
          <h3 className="text-xs font-mono tracking-wider text-[var(--text-muted)] mb-3">TOP EARTHQUAKES (MAGNITUDE)</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" domain={[0, 'dataMax + 1']} tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: '#aaa' }} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                <Bar dataKey="magnitude" fill="#FF3D3D" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-[var(--text-muted)]">No earthquake data</p>}
        </div>

        {/* Sensor Distribution Pie */}
        <div className="border border-[var(--border-primary)] rounded-lg p-4">
          <h3 className="text-xs font-mono tracking-wider text-[var(--text-muted)] mb-3">SENSOR DISTRIBUTION</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-[var(--text-muted)]">No sensor data</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="border border-[var(--border-primary)] rounded-lg p-3 flex items-center gap-3">
      <div className="p-2 rounded-lg shrink-0" style={{ background: `${color}15`, color }}>{icon}</div>
      <div>
        <div className="text-lg font-mono font-bold text-white">{value.toLocaleString()}</div>
        <div className="text-[9px] font-mono text-[var(--text-muted)] tracking-wider">{label}</div>
      </div>
    </div>
  );
}
