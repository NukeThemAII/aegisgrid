'use client';

import { memo } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface TabDef {
  id: string;
  label: string;
  icon: any;
  placeholder: string;
  color: string;
  mode: 'active' | 'passive';
}

interface OsintInputProps {
  query: string;
  onQueryChange: (q: string) => void;
  onRun: () => void;
  loading: boolean;
  activeTab: string;
  scanType: string;
  onScanTypeChange: (t: string) => void;
  sweepCidr: number;
  onSweepCidrChange: (c: number) => void;
  tabs: TabDef[];
}

function OsintInputInner({
  query, onQueryChange, onRun, loading,
  activeTab, scanType, onScanTypeChange,
  sweepCidr, onSweepCidrChange, tabs
}: OsintInputProps) {
  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onRun()}
            placeholder={currentTab?.placeholder}
            className="w-full bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg pl-8 pr-3 py-2.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 focus:outline-none transition-colors"
            style={{ borderColor: query ? `${currentTab?.color}40` : undefined }} />
        </div>
        <button onClick={onRun} disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg text-[10px] font-mono font-bold tracking-wider disabled:opacity-30 transition-all flex items-center justify-center min-w-[70px]"
          style={{ backgroundColor: `${currentTab?.color}20`, border: `1px solid ${currentTab?.color}40`, color: currentTab?.color }}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'SCAN'}
        </button>
      </div>

      {/* Secondary Controls */}
      {activeTab === 'scanner' && (
        <>
          <select value={scanType} onChange={e => onScanTypeChange(e.target.value)}
            className="bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[10px] font-mono text-[var(--text-muted)] outline-none w-full">
            <option value="quick">QUICK SCAN (verified targets only)</option>
          </select>
          <div className="text-[8px] font-mono text-[var(--text-muted)]/60 px-1">
            🔒 Active scans require target ownership verification
          </div>
        </>
      )}
      {/* Passive/Active info badge */}
      {activeTab !== 'scanner' && activeTab !== 'sweep' && (
        <div className="text-[8px] font-mono px-1" style={{ color: currentTab?.mode === 'passive' ? '#76FF03' : '#FF9500' }}>
          {currentTab?.mode === 'passive'
            ? '🔓 Passive lookup — no target verification required'
            : '🔒 Active scan — requires verified target'}
        </div>
      )}
      {activeTab === 'sweep' && (
        <div className="flex items-center justify-between bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg p-1">
          <span className="text-[9px] font-mono text-[var(--text-muted)] pl-2">SUBNET MASK:</span>
          <div className="flex items-center gap-0.5">
            {[24, 25, 26, 27, 28].map(c => (
              <button key={c} onClick={() => onSweepCidrChange(c)}
                className={`px-2 py-1 text-[10px] font-mono rounded transition-all ${
                  sweepCidr === c ? 'bg-[#FF3D3D]/20 text-[#FF3D3D]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >/{c}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const OsintInput = memo(OsintInputInner);
export default OsintInput;
