'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar, ChevronUp, ChevronDown,
  Maximize2, Minimize2, Search, Globe, Shield, FileText,
  Server, Wifi, Lock, Bug, Code, Layers, Fingerprint,
  CheckCircle, XCircle, Clock, ExternalLink, Crosshair,
  AlertTriangle, Loader2
} from 'lucide-react';
import OsintTabs from '@/components/panels/osint/OsintTabs';
import OsintInput from '@/components/panels/osint/OsintInput';
import OsintResults from '@/components/panels/osint/OsintResults';

// Passive modules run in-process and are available to all users.
// Active modules require verified target + scanner backend.
const TABS = [
  { id: 'scanner', label: 'PORT SCAN 🔒', icon: Radar, placeholder: 'IP or hostname (verified targets only)', color: '#00E5FF', mode: 'active' as const },
  { id: 'vuln', label: 'CVE LOOKUP', icon: Bug, placeholder: 'CVE ID (e.g. CVE-2024-1234)', color: '#FF3D3D', mode: 'passive' as const },
  { id: 'dns', label: 'DNS', icon: Server, placeholder: 'Domain name', color: '#448AFF', mode: 'passive' as const },
  { id: 'whois', label: 'WHOIS', icon: FileText, placeholder: 'Domain or IP', color: '#FFD700', mode: 'passive' as const },
  { id: 'certs', label: 'CERTS', icon: Lock, placeholder: 'Domain name', color: '#E040FB', mode: 'passive' as const },
  { id: 'threats', label: 'THREATS', icon: AlertTriangle, placeholder: 'IP, domain, or hash', color: '#FF9500', mode: 'passive' as const },
  { id: 'headers', label: 'HEADERS 🔒', icon: Code, placeholder: 'Hostname (verified targets only)', color: '#87CEEB', mode: 'active' as const },
  { id: 'ssl', label: 'SSL/TLS 🔒', icon: Shield, placeholder: 'Domain (verified targets only)', color: '#76FF03', mode: 'active' as const },
  { id: 'subdomains', label: 'SUBDOMAINS', icon: Layers, placeholder: 'Domain to enumerate (passive CT logs)', color: '#00BCD4', mode: 'passive' as const },
  { id: 'tech', label: 'TECH 🔒', icon: Fingerprint, placeholder: 'Hostname (verified targets only)', color: '#9C27B0', mode: 'active' as const },
  { id: 'sweep', label: 'IP SWEEP', icon: Crosshair, placeholder: 'Enter IP address (e.g. 8.8.8.8)', color: '#FF3D3D', mode: 'passive' as const },
];

interface OsintPanelProps { isOpen?: boolean; onClose?: () => void; isMobile?: boolean; onSweepVisualize?: (data: any) => void; }

function OsintPanelInner({ isMobile, onSweepVisualize }: OsintPanelProps) {
  const [activeTab, setActiveTab] = useState('scanner');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanType, setScanType] = useState('quick');
  const [expanded, setExpanded] = useState(true);
  const [history, setHistory] = useState<{tab:string;query:string;time:string}[]>([]);
  const [sweepResult, setSweepResult] = useState<any>(null);
  const [sweepProgress, setSweepProgress] = useState<{ current: number; total: number } | null>(null);
  const [sweepCidr, setSweepCidr] = useState(24);
  const [cveCache, setCveCache] = useState<Record<string, any>>({});
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  // Fetch CVE details when a device is expanded in full-screen mode
  const fetchCveDetails = useCallback(async (cveIds: string[]) => {
    const missing = cveIds.filter(id => !cveCache[id]);
    if (missing.length === 0) return;
    // Mark as loading
    setCveCache(prev => {
      const next = { ...prev };
      for (const id of missing) next[id] = { loading: true };
      return next;
    });
    // Fetch in parallel
    const results = await Promise.allSettled(
      missing.map(id => fetch(`/api/osint/cve?cve=${encodeURIComponent(id)}`).then(r => r.json()).then(data => ({ id, data })))
    );
    setCveCache(prev => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled') {
          next[r.value.id] = r.value.data;
        }
      }
      return next;
    });
  }, [cveCache]);

  const runLookup = useCallback(async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setError(''); setResults(null);

    // IP Sweep — separate flow
    if (activeTab === 'sweep') {
      setSweepResult(null);
      setSweepProgress({ current: 0, total: Math.pow(2, 32 - sweepCidr) });
      try {
        const res = await fetch(`/api/osint/sweep?ip=${encodeURIComponent(query)}&cidr=${sweepCidr}`);
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Sweep failed (${res.status})`); }
        const data = await res.json();
        setSweepResult(data);
        setSweepProgress(null);
        setHistory(prev => [{ tab: 'sweep', query, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      } catch (err: any) {
        setError(err.message);
        setSweepProgress(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      let url = '';
      switch (activeTab) {
        case 'dns': url = `/api/osint/dns?domain=${encodeURIComponent(query)}`; break;
        case 'certs': url = `/api/osint/certs?domain=${encodeURIComponent(query)}`; break;
        case 'whois': url = `/api/osint/whois?domain=${encodeURIComponent(query)}`; break;
        case 'threats': url = `/api/osint/threats?query=${encodeURIComponent(query)}`; break;
        case 'scanner': url = `/api/scanner?target=${encodeURIComponent(query)}&type=${scanType}`; break;
        case 'vuln': url = `/api/osint/cve?cve=${encodeURIComponent(query)}`; break;
        case 'headers': url = `/api/scanner?target=${encodeURIComponent(query)}&type=headers`; break;
        case 'ssl': url = `/api/scanner?target=${encodeURIComponent(query)}&type=ssl`; break;
        case 'subdomains': url = `/api/scanner?target=${encodeURIComponent(query)}&type=subdomains`; break;
        case 'tech': url = `/api/scanner?target=${encodeURIComponent(query)}&type=tech`; break;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setResults(data);
        setHistory(prev => [{ tab: activeTab, query, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
      } else {
        // Friendly messages for common error types
        const code = data.code || '';
        if (code === 'ACTIVE_SCAN_REQUIRES_AUTH' || code === 'AUTH_REQUIRED') {
          setError('This scan requires authentication. Sign in with GitHub (top-right) or configure an API token.');
        } else if (code === 'SCANNER_BACKEND_NOT_CONFIGURED') {
          setError('Active scanner backend is not configured on this deployment. Passive lookups are available.');
        } else if (code === 'RATE_LIMITED') {
          setError(data.detail || 'Rate limit exceeded. Please wait before retrying.');
        } else {
          setError(data.error || data.message || 'Lookup failed');
        }
      }
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }, [query, activeTab, scanType, loading, sweepCidr]);

  const currentTab = TABS.find(t => t.id === activeTab);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setQuery('');
    setResults(null);
    setError('');
  }, []);

  const handleHistoryClick = useCallback((tab: string, q: string) => {
    setActiveTab(tab);
    setQuery(q);
  }, []);

  const handleDeviceExpand = useCallback((ip: string | null) => {
    setExpandedDevice(ip);
  }, []);

  const renderContent = () => (
    <div className="flex flex-col gap-2.5">
      <OsintTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabs={TABS}
      />

      <OsintInput
        query={query}
        onQueryChange={setQuery}
        onRun={runLookup}
        loading={loading}
        activeTab={activeTab}
        scanType={scanType}
        onScanTypeChange={setScanType}
        sweepCidr={sweepCidr}
        onSweepCidrChange={setSweepCidr}
        tabs={TABS}
      />

      <OsintResults
        results={results}
        activeTab={activeTab}
        currentTab={currentTab}
        sweepResult={sweepResult}
        loading={loading}
        sweepProgress={sweepProgress}
        error={error}
        query={query}
        scanType={scanType}
        isFullScreen={isFullScreen}
        history={history}
        onHistoryClick={handleHistoryClick}
        cveCache={cveCache}
        expandedDevice={expandedDevice}
        onDeviceExpand={handleDeviceExpand}
        onSweepVisualize={onSweepVisualize}
        fetchCveDetails={fetchCveDetails}
        tabs={TABS}
      />
    </div>
  );

  if (isMobile) return renderContent();

  if (isFullScreen) {
    return (
      <div className="fixed inset-4 z-[999] glass-panel bg-[#0a0a09]/95 backdrop-blur-2xl border border-[var(--cyan-primary)]/40 rounded-xl flex flex-col overflow-hidden shadow-2xl shadow-[var(--cyan-primary)]/20">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-secondary)] bg-[#111]">
          <div className="flex items-center gap-3">
            <Radar className="w-5 h-5 text-[var(--cyan-primary)]" />
            <span className="hud-text text-[16px] text-[var(--text-primary)]">AEGIS RECON TOOLKIT</span>
            <span className="gotham-tag gotham-tag--info" style={{ fontSize: '9px' }}>FULL SCREEN</span>
            <span className="gotham-tag gotham-tag--classified" style={{ fontSize: '8px' }}>{TABS.length} MODULES</span>
          </div>
          <button onClick={() => setIsFullScreen(false)} className="p-2 hover:bg-white/5 rounded transition-colors text-[var(--text-muted)] hover:text-white">
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 styled-scrollbar">
          {/* We wrap renderContent in a container that forces wider layouts if we want to target it with CSS */}
          <div className="max-w-[1400px] mx-auto w-full full-screen-mode-content">
             {renderContent()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="glass-panel flex flex-col overflow-hidden pointer-events-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-transparent hover:bg-[var(--hover-accent)] transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1">
          <Radar className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">RECON TOOLKIT</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '7px', padding: '1px 5px' }}>{TABS.length} TOOLS</span>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsFullScreen(true)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Full Screen">
             <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--cyan-primary)] animate-aegisgrid-pulse" />
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden px-3 pb-3">
            {renderContent()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const OsintPanel = memo(OsintPanelInner);
export default OsintPanel;
