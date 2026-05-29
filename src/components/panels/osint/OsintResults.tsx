'use client';

import { memo } from 'react';
import {
  ChevronDown, Loader2, AlertTriangle, Server,
  Wifi, Bug, Globe, CheckCircle, XCircle, Clock, ExternalLink,
  FileText, Lock, Layers, Shield
} from 'lucide-react';
import { getScannerV2Meta, getScannerV2Payload, getStringArrayField } from '@/lib/scanner-result-format';

interface TabDef {
  id: string;
  label: string;
  icon: any;
  placeholder: string;
  color: string;
  mode: 'active' | 'passive';
}

interface HistoryEntry {
  tab: string;
  query: string;
  time: string;
}

interface OsintResultsProps {
  results: any;
  activeTab: string;
  currentTab: TabDef | undefined;
  sweepResult: any;
  loading: boolean;
  sweepProgress: { current: number; total: number } | null;
  error: string;
  query: string;
  scanType: string;
  isFullScreen: boolean;
  history: HistoryEntry[];
  onHistoryClick: (tab: string, query: string) => void;
  cveCache: Record<string, any>;
  expandedDevice: string | null;
  onDeviceExpand: (ip: string | null) => void;
  onSweepVisualize: ((data: any) => void) | undefined;
  fetchCveDetails: (cveIds: string[]) => void;
  tabs: TabDef[];
}

const ResultRow = ({ label, value, color, mono = true }: { label: string; value: any; color?: string; mono?: boolean }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
      <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider w-[90px] flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-[10px] ${mono ? 'font-mono' : ''} break-all flex-1`} style={{ color: color || 'var(--text-primary)' }}>
        {String(value)}
      </span>
    </div>
  );
};

const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold ${ok ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
    {ok ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
    {label}
  </span>
);

const SectionHeader = ({ title, icon: Icon, color }: { title: string; icon: any; color: string }) => (
  <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0">
    <Icon className="w-3.5 h-3.5" style={{ color }} />
    <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color }}>{title}</span>
    <div className="flex-1 h-px" style={{ background: `${color}30` }} />
  </div>
);

const ScannerMetaBlock = ({ meta }: { meta: ReturnType<typeof getScannerV2Meta> }) => {
  if (!meta) return null;
  return (
    <div className="mb-2 p-2 rounded-lg border border-[var(--border-secondary)]/30 bg-[var(--bg-primary)]/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[9px] font-mono font-bold tracking-widest text-[var(--cyan-primary)]">SCANNER V2</span>
        <StatusBadge ok={meta.ok !== false} label={(meta.status || 'ok').toUpperCase()} />
      </div>
      <ResultRow label="Module" value={meta.label || meta.scan_type} />
      <ResultRow label="Mode" value={meta.mode} color={meta.mode === 'passive' ? '#76FF03' : '#FF9500'} />
      <ResultRow label="Fetched" value={meta.fetched_at} />
    </div>
  );
};

const PortRow = ({ port, state, service, version }: { port: number; state: string; service?: string; version?: string }) => (
  <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[var(--hover-accent)] transition-colors">
    <span className="text-[11px] font-mono font-bold text-[var(--cyan-primary)] w-[60px]">{port}</span>
    <StatusBadge ok={state === 'open'} label={state.toUpperCase()} />
    <span className="text-[10px] font-mono text-[var(--text-secondary)] flex-1">{service || 'unknown'}</span>
    {version && <span className="text-[9px] font-mono text-[var(--text-muted)]">{version}</span>}
  </div>
);

function OsintResultsInner({
  results, activeTab, currentTab,
  sweepResult, loading, sweepProgress, error,
  query, scanType, isFullScreen,
  history, onHistoryClick,
  cveCache, expandedDevice, onDeviceExpand,
  onSweepVisualize, fetchCveDetails,
  tabs,
}: OsintResultsProps) {

  const renderFallback = () => {
    if (!results) return null;
    const fallbackPayload = getScannerV2Payload(results) as Record<string, unknown>;
    return (
      <div className="space-y-1">
        {Object.entries(fallbackPayload).filter(([k]) => !['timestamp','cached'].includes(k)).map(([key, value]) => (
          <ResultRow key={key} label={key.replace(/_/g, ' ')} value={typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)} />
        ))}
      </div>
    );
  };

  const renderFallbackExcluding = (exclude: string[]) => {
    if (!results) return null;
    const fallbackPayload = getScannerV2Payload(results) as Record<string, unknown>;
    const extra = Object.entries(fallbackPayload).filter(([k]) => !exclude.includes(k));
    if (extra.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        {extra.map(([key, value]) => (
          <ResultRow key={key} label={key.replace(/_/g, ' ')} value={typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)} />
        ))}
      </div>
    );
  };

  const renderStructuredResults = () => {
    if (!results) return null;
    const scannerMeta = getScannerV2Meta(results);
    const r = getScannerV2Payload(results) as any;

    // ── PORT SCAN ──
    if (activeTab === 'scanner') {
      const ports = r.ports || r.open_ports || r.results || [];
      const host = r.host || r.target || query;
      return (
        <div>
          <ScannerMetaBlock meta={scannerMeta} />
          <SectionHeader title="HOST INFO" icon={Server} color="#00E5FF" />
          <ResultRow label="Target" value={host} color="#00E5FF" />
          <ResultRow label="Scan Type" value={r.scan_type || scanType} />
          <ResultRow label="Duration" value={r.duration || r.scan_time} />
          {Array.isArray(ports) && ports.length > 0 && (
            <>
              <SectionHeader title={`OPEN PORTS (${ports.length})`} icon={Wifi} color="#00E676" />
              <div className="space-y-0.5">
                {ports.map((p: any, i: number) => (
                  <PortRow key={i} port={p.port || p} state={p.state || 'open'} service={p.service || p.name} version={p.version} />
                ))}
              </div>
            </>
          )}
          {(!Array.isArray(ports) || ports.length === 0) && renderFallback()}
        </div>
      );
    }

    // ── VULN SCAN ──
    if (activeTab === 'vuln') {
      const vulns = Array.isArray(r.vulnerabilities || r.vulns || r.cves) ? (r.vulnerabilities || r.vulns || r.cves) : [];
      const exploits = vulns.filter((v: any) => v.is_exploit);
      const regularVulns = vulns.filter((v: any) => !v.is_exploit);
      const descriptions = Array.isArray(r.descriptions) ? r.descriptions.filter((d: any) => d && typeof d.value === 'string') : [];

      return (
        <div>
          <ScannerMetaBlock meta={scannerMeta} />
          <SectionHeader title="VULNERABILITY ASSESSMENT" icon={Bug} color="#FF3D3D" />
          <ResultRow label="Target" value={r.target || query} color="#FF3D3D" />
          <ResultRow label="Status" value={r.status} />
          <ResultRow label="CVE" value={r.cve_id} color="#FF3D3D" />
          <ResultRow label="State" value={r.state} />
          <ResultRow label="Total CVEs" value={Array.isArray(vulns) ? vulns.length : 0} color={Array.isArray(vulns) && vulns.length > 0 ? '#FF3D3D' : '#00E676'} />
          <ResultRow label="Risk Level" value={r.risk_level || r.severity} />
          {descriptions.length > 0 && (
            <div className="mt-2 space-y-1">
              {descriptions.slice(0, 3).map((d: any, i: number) => (
                <div key={i} className="p-2 rounded-lg border border-red-500/20 bg-red-500/5">
                  <div className="text-[8px] font-mono text-red-400 mb-1">DESCRIPTION {d.lang ? `(${String(d.lang).toUpperCase()})` : ''}</div>
                  <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">{d.value}</p>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(regularVulns) && regularVulns.length > 0 && (
            <div className="mt-2 space-y-1">
              {regularVulns.slice(0, 20).map((v: any, i: number) => (
                <div key={i} className="p-2 rounded-lg border border-red-500/20 bg-red-500/5 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-red-400">{v.id || v.cve || v.name}</span>
                    {v.severity && <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${v.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : v.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{v.severity}</span>}
                  </div>
                  {v.cvss && <div className="text-[9px] font-mono text-[var(--text-muted)] mt-1">CVSS: {v.cvss} ({v.type || 'cve'})</div>}
                  {v.description && <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1 line-clamp-2">{v.description}</p>}
                </div>
              ))}
            </div>
          )}

          {exploits.length > 0 && (
            <div className="mt-4">
              <SectionHeader title={`POSSIBLE EXPLOITS (${exploits.length})`} icon={AlertTriangle} color="#FF9500" />
              <div className="mt-2 space-y-1">
                {exploits.slice(0, 10).map((e: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg border border-orange-500/30 bg-orange-500/10 flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-orange-400">{e.id}</span>
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">EXPLOIT</span>
                    </div>
                    <div className="text-[9px] font-mono text-[var(--text-muted)] mt-1 flex justify-between">
                      <span>Source: {e.type?.toUpperCase() || 'UNKNOWN'}</span>
                      {e.cvss && <span>CVSS: {e.cvss}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vulns.length === 0 && descriptions.length === 0 && renderFallback()}
        </div>
      );
    }

    // ── DNS ──
    if (activeTab === 'dns') {
      return (
        <div>
          <SectionHeader title="DNS RECORDS" icon={Server} color="#448AFF" />
          <ResultRow label="Domain" value={r.domain || query} color="#448AFF" />
          {r.A && <ResultRow label="A Records" value={Array.isArray(r.A) ? r.A.join(', ') : r.A} />}
          {r.AAAA && <ResultRow label="AAAA" value={Array.isArray(r.AAAA) ? r.AAAA.join(', ') : r.AAAA} />}
          {r.MX && <ResultRow label="MX" value={Array.isArray(r.MX) ? r.MX.map((m:any) => m.exchange || m).join(', ') : r.MX} />}
          {r.NS && <ResultRow label="NS" value={Array.isArray(r.NS) ? r.NS.join(', ') : r.NS} />}
          {r.TXT && <ResultRow label="TXT" value={Array.isArray(r.TXT) ? r.TXT.join(' | ') : r.TXT} />}
          {r.CNAME && <ResultRow label="CNAME" value={Array.isArray(r.CNAME) ? r.CNAME.join(', ') : r.CNAME} />}
          {r.SOA && <ResultRow label="SOA" value={typeof r.SOA === 'object' ? `${r.SOA.nsname} (${r.SOA.hostmaster})` : r.SOA} />}
          {renderFallbackExcluding(['domain','A','AAAA','MX','NS','TXT','CNAME','SOA','timestamp','cached'])}
        </div>
      );
    }

    // ── WHOIS ──
    if (activeTab === 'whois') {
      return (
        <div>
          <SectionHeader title="WHOIS INTELLIGENCE" icon={FileText} color="#FFD700" />
          <ResultRow label="Domain" value={r.domain_name || r.domainName || query} color="#FFD700" />
          <ResultRow label="Registrar" value={r.registrar} />
          <ResultRow label="Created" value={r.creation_date || r.createdDate} />
          <ResultRow label="Expires" value={r.expiration_date || r.expiresDate} />
          <ResultRow label="Updated" value={r.updated_date || r.updatedDate} />
          <ResultRow label="Status" value={Array.isArray(r.status) ? r.status.join(', ') : r.status} />
          <ResultRow label="Nameservers" value={Array.isArray(r.name_servers || r.nameServers) ? (r.name_servers || r.nameServers).join(', ') : r.name_servers} />
          {renderFallbackExcluding(['domain_name','domainName','registrar','creation_date','createdDate','expiration_date','expiresDate','updated_date','updatedDate','status','name_servers','nameServers','timestamp','cached','raw'])}
        </div>
      );
    }

    // ── CERTS ──
    if (activeTab === 'certs') {
      const certs = r.certificates || r.certs || (Array.isArray(r) ? r : []);
      return (
        <div>
          <SectionHeader title="CERTIFICATE TRANSPARENCY" icon={Lock} color="#E040FB" />
          <ResultRow label="Domain" value={query} color="#E040FB" />
          <ResultRow label="Certificates" value={Array.isArray(certs) ? certs.length : 0} />
          {Array.isArray(certs) && certs.slice(0, 15).map((c: any, i: number) => (
            <div key={i} className="mt-1.5 p-2 rounded border border-[var(--border-secondary)]/30 bg-[var(--bg-tertiary)]/30">
              <ResultRow label="Issuer" value={c.issuer_name || c.issuer} />
              <ResultRow label="Common Name" value={c.common_name || c.name_value} />
              <ResultRow label="Not Before" value={c.not_before} />
              <ResultRow label="Not After" value={c.not_after} />
            </div>
          ))}
          {(!Array.isArray(certs) || certs.length === 0) && renderFallback()}
        </div>
      );
    }

    // ── THREATS ──
    if (activeTab === 'threats') {
      return (
        <div>
          <SectionHeader title="THREAT INTELLIGENCE" icon={AlertTriangle} color="#FF9500" />
          <ResultRow label="Query" value={query} color="#FF9500" />
          <ResultRow label="Risk Score" value={r.risk_score || r.score} color={
            (r.risk_score || r.score || 0) > 70 ? '#FF3D3D' : (r.risk_score || r.score || 0) > 40 ? '#FF9500' : '#00E676'
          } />
          <ResultRow label="Malicious" value={r.malicious !== undefined ? (r.malicious ? 'YES' : 'NO') : undefined} color={r.malicious ? '#FF3D3D' : '#00E676'} />
          <ResultRow label="Category" value={r.category || r.type} />
          <ResultRow label="Reports" value={r.total_reports || r.reports} />
          <ResultRow label="Last Seen" value={r.last_seen || r.last_analysis} />
          {r.tags && <ResultRow label="Tags" value={Array.isArray(r.tags) ? r.tags.join(', ') : r.tags} />}
          {renderFallbackExcluding(['risk_score','score','malicious','category','type','total_reports','reports','last_seen','last_analysis','tags','timestamp','cached','query'])}
        </div>
      );
    }

    // ── SUBDOMAINS ──
    if (activeTab === 'subdomains') {
      const subdomains = getStringArrayField(r, 'subdomains');
      return (
        <div>
          <ScannerMetaBlock meta={scannerMeta} />
          <SectionHeader title="PASSIVE SUBDOMAINS" icon={Layers} color="#00BCD4" />
          <ResultRow label="Domain" value={r.target || query} color="#00BCD4" />
          <ResultRow label="Status" value={r.status} />
          <ResultRow label="Count" value={typeof r.count === 'number' ? r.count : subdomains.length} />
          <ResultRow label="Source" value={r.source} />
          {subdomains.length > 0 && (
            <div className="mt-2 space-y-1 max-h-56 overflow-y-auto styled-scrollbar">
              {subdomains.slice(0, 100).map((name) => (
                <div key={name} className="px-2 py-1 rounded border border-[#00BCD4]/20 bg-[#00BCD4]/5 text-[10px] font-mono text-[var(--text-secondary)] break-all">
                  {name}
                </div>
              ))}
            </div>
          )}
          {subdomains.length === 0 && renderFallback()}
        </div>
      );
    }

    // ── SSL ──
    if (activeTab === 'ssl') {
      return (
        <div>
          <SectionHeader title="SSL/TLS ANALYSIS" icon={Shield} color="#76FF03" />
          <ResultRow label="Target" value={query} color="#76FF03" />
          <ResultRow label="Protocol" value={r.protocol || r.tls_version} />
          <ResultRow label="Cipher" value={r.cipher || r.cipher_suite} />
          <ResultRow label="Valid" value={r.valid !== undefined ? (r.valid ? 'YES' : 'NO') : undefined} color={r.valid ? '#00E676' : '#FF3D3D'} />
          <ResultRow label="Issuer" value={r.issuer} />
          <ResultRow label="Subject" value={r.subject} />
          <ResultRow label="Expires" value={r.expires || r.not_after} />
          <ResultRow label="SANs" value={Array.isArray(r.sans) ? r.sans.join(', ') : r.sans} />
          {renderFallback()}
        </div>
      );
    }

    // Fallback for other tools
    return renderFallback();
  };

  return (
    <>
      {error && (
        <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] font-mono text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Sweep Progress */}
      {sweepProgress && loading && (
        <div className="p-3 rounded-lg border border-[#FF3D3D]/30 bg-[#FF3D3D]/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono tracking-wider text-[#FF3D3D]">SWEEPING SUBNET...</span>
            <span className="text-[10px] font-mono text-[#E8E6E0]">{sweepProgress.total} hosts</span>
          </div>
          <div className="w-full h-1.5 bg-[#1A1A18] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '100%', background: 'linear-gradient(90deg, #FF3D3D, #FF6B00, #FFD700)', animation: 'sweep-pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {/* Sweep Results */}
      {sweepResult && !loading && (
        <div className="bg-[var(--bg-primary)]/40 border border-[var(--border-primary)] rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto styled-scrollbar">
          {/* Summary */}
          <div className="p-3 border-b border-[#2A2A28]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] font-mono tracking-wider text-[#E8E6E0]">{sweepResult.subnet}</div>
                <div className="text-[9px] font-mono text-[#5C5A54]">{sweepResult.center.city}, {sweepResult.center.country} · {sweepResult.center.isp}</div>
              </div>
              <div className="text-right">
                <div className="text-[18px] font-mono font-bold text-[#FF3D3D]">{sweepResult.summary.total_responsive}</div>
                <div className="text-[8px] font-mono text-[#5C5A54] tracking-wider">DEVICES FOUND</div>
              </div>
            </div>
            {/* Breakdown Bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-[#1A1A18] mb-2">
              {Object.entries(sweepResult.summary.device_breakdown).map(([type, count]: [string, any]) => {
                const device = sweepResult.devices.find((d: any) => d.device_type === type);
                return <div key={type} style={{ width: `${(count / sweepResult.summary.total_responsive) * 100}%`, backgroundColor: device?.device_color || '#666' }} title={`${type}: ${count}`} />;
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(sweepResult.summary.device_breakdown).map(([type, count]: [string, any]) => {
                const device = sweepResult.devices.find((d: any) => d.device_type === type);
                return (
                  <div key={type} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: device?.device_color || '#666' }} />
                    <span className="text-[9px] font-mono text-[#8A8880]">{type}</span>
                    <span className="text-[9px] font-mono text-[#E8E6E0] font-bold">{String(count)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Visualize Button */}
          <div className="p-3 border-b border-[#2A2A28]">
            <button onClick={() => onSweepVisualize?.(sweepResult)}
              className="w-full py-2.5 rounded-lg font-mono text-[11px] tracking-wider font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, rgba(255,61,61,0.2), rgba(255,107,0,0.2))', border: '1px solid rgba(255,61,61,0.5)', color: '#FF3D3D', textShadow: '0 0 10px rgba(255,61,61,0.5)' }}
            >
              <Globe className="w-4 h-4" /> VISUALIZE ON GLOBE
            </button>
          </div>
          {/* Device List */}
          <div className={isFullScreen ? "flex flex-col gap-3 p-4" : "divide-y divide-[#2A2A28]"}>
            {sweepResult.devices.map((device: any) => {
              const isExpanded = expandedDevice === device.ip;
              return (
              <div key={device.ip} className={isFullScreen
                ? "bg-[#0D0D0C] border border-[#2A2A28] rounded-lg overflow-hidden hover:border-[#3A3A38] transition-colors"
                : "px-3 py-2.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              }>
                {/* Device Header */}
                <div
                  className={isFullScreen
                    ? "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#151514] transition-colors"
                    : "flex items-center justify-between mb-1"
                  }
                  onClick={() => {
                    if (!isFullScreen) return;
                    const next = isExpanded ? null : device.ip;
                    onDeviceExpand(next);
                    if (next && device.vulns.length > 0) fetchCveDetails(device.vulns);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: device.device_color }} />
                    <span className={isFullScreen ? "text-[14px] font-mono font-bold text-[#E8E6E0]" : "text-[11px] font-mono text-[#E8E6E0]"}>{device.ip}</span>
                    {device.hostnames.length > 0 && (
                      <span className={`${isFullScreen ? "text-[11px]" : "text-[9px]"} font-mono text-[#5C5A54]`}>{device.hostnames[0]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {device.vulns.length > 0 && (
                      <span className={`${isFullScreen ? "text-[10px]" : "text-[8px]"} font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30`}>
                        {device.vulns.length} CVEs
                      </span>
                    )}
                    <span className={`${isFullScreen ? "text-[10px]" : "text-[8px]"} font-mono px-1.5 py-0.5 rounded`} style={{ backgroundColor: device.device_color + '20', color: device.device_color, border: `1px solid ${device.device_color}40` }}>{device.device_type}</span>
                    {isFullScreen && (
                      <ChevronDown className={`w-4 h-4 text-[#5C5A54] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </div>

                {/* Compact info (sidebar mode) */}
                {!isFullScreen && (
                  <>
                    <div className="flex items-center gap-2 text-[9px] font-mono text-[#5C5A54]">
                      <span>Ports: {device.ports.slice(0, 8).join(', ')}{device.ports.length > 8 ? ` +${device.ports.length - 8}` : ''}</span>
                      {device.vulns.length > 0 && (
                        <div className="group relative flex items-center gap-1 cursor-help">
                          <span className="text-[#FF3D3D] flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> {device.vulns.length} CVEs
                          </span>
                          <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 p-2 bg-[#1A1A18] border border-[#FF3D3D50] rounded-md shadow-xl min-w-[140px] max-w-[220px] max-h-[150px] overflow-y-auto styled-scrollbar">
                            <div className="text-[8px] font-mono text-[#FF3D3D] mb-1 tracking-wider uppercase border-b border-[#FF3D3D30] pb-1">Identified Vulnerabilities</div>
                            <div className="flex flex-col gap-0.5">
                              {device.vulns.map((cve: string) => (
                                <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noreferrer" className="text-[9px] font-mono text-[#E8E6E0] hover:text-[#FF3D3D] transition-colors truncate">
                                  {cve}
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {device.hostnames.length > 0 && <div className="text-[9px] font-mono text-[#8A8880] mt-0.5 truncate">{device.hostnames[0]}</div>}
                  </>
                )}

                {/* Full-Screen Expanded Detail */}
                {isFullScreen && isExpanded && (
                  <div className="border-t border-[#2A2A28]">
                    {/* Ports + Hostnames Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#2A2A28]">
                      <div className="bg-[#0D0D0C] p-4">
                        <div className="text-[10px] font-mono text-[#5C5A54] tracking-widest uppercase mb-2">Open Ports</div>
                        <div className="flex flex-wrap gap-1.5">
                          {device.ports.map((port: number) => (
                            <span key={port} className="px-2 py-1 bg-[#1A1A18] border border-[#2A2A28] rounded text-[11px] font-mono text-[var(--cyan-primary)]">{port}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-[#0D0D0C] p-4">
                        <div className="text-[10px] font-mono text-[#5C5A54] tracking-widest uppercase mb-2">Hostnames</div>
                        {device.hostnames.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {device.hostnames.map((h: string) => (
                              <span key={h} className="text-[11px] font-mono text-[#E8E6E0]">{h}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-[#3A3A38]">No reverse DNS</span>
                        )}
                      </div>
                    </div>

                    {/* CVE Intelligence */}
                    {device.vulns.length > 0 && (
                      <div className="p-4 border-t border-[#2A2A28]">
                        <div className="text-[10px] font-mono text-[#5C5A54] tracking-widest uppercase mb-3">Vulnerabilities ({device.vulns.length})</div>
                        <div className="flex flex-col gap-2">
                          {device.vulns.map((cveId: string) => {
                            const info = cveCache[cveId];
                            const isLoading = !info || info.loading;
                            const severityColor = !info?.severity ? '#5C5A54'
                              : info.severity === 'CRITICAL' ? '#FF3D3D'
                              : info.severity === 'HIGH' ? '#FF6B00'
                              : info.severity === 'MEDIUM' ? '#FFD700'
                              : '#76FF03';
                            return (
                              <div key={cveId} className="bg-[#111] border border-[#2A2A28] rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-mono font-bold text-[#E8E6E0]">{cveId}</span>
                                    {info?.cvss != null && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: severityColor + '15', color: severityColor, border: `1px solid ${severityColor}40` }}>CVSS {info.cvss}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {info?.severity && (
                                      <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: severityColor + '15', color: severityColor, border: `1px solid ${severityColor}40` }}>{info.severity}</span>
                                    )}
                                    <a href={`https://nvd.nist.gov/vuln/detail/${cveId}`} target="_blank" rel="noreferrer" className="text-[#5C5A54] hover:text-[#E8E6E0] transition-colors">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                </div>
                                {isLoading ? (
                                  <div className="flex items-center gap-2 py-1">
                                    <Loader2 className="w-3 h-3 animate-spin text-[#5C5A54]" />
                                    <span className="text-[10px] font-mono text-[#5C5A54]">Fetching vulnerability intelligence...</span>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-[11px] font-mono text-[#8A8880] leading-relaxed">{info.description}</p>
                                    {info.cwe && <div className="text-[10px] font-mono text-[#5C5A54] mt-2">Weakness: {info.cwe}</div>}
                                    {info.affected && info.affected.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {info.affected.map((a: any, i: number) => (
                                          <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#1A1A18] border border-[#2A2A28] rounded text-[#8A8880]">
                                            {a.vendor}/{a.product}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
          <div className="px-3 py-2 border-t border-[#2A2A28]">
            <div className="text-[8px] font-mono text-[#5C5A54] tracking-wider">SWEPT {sweepResult.summary.total_hosts} HOSTS IN {(sweepResult.sweep_time_ms / 1000).toFixed(1)}s · ASN {sweepResult.center.asn}</div>
          </div>
        </div>
      )}

      {/* Regular Results */}
      {results && !(sweepResult && !loading) && (
        <div className="bg-[var(--bg-primary)]/40 border border-[var(--border-primary)] rounded-lg p-3 max-h-[50vh] overflow-y-auto styled-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono tracking-widest" style={{ color: currentTab?.color }}>{currentTab?.label} RESULTS</span>
            <span className="text-[8px] font-mono text-[var(--text-muted)] flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date().toLocaleTimeString()}</span>
          </div>
          {renderStructuredResults()}
        </div>
      )}

      {/* History */}
      {history.length > 0 && !results && (
        <div className="space-y-1">
          <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)]">RECENT SCANS</span>
          {history.slice(0, 5).map((h, i) => (
            <button key={i} onClick={() => onHistoryClick(h.tab, h.query)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[var(--hover-accent)] transition-colors text-left">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono" style={{ color: tabs.find(t => t.id === h.tab)?.color }}>{tabs.find(t => t.id === h.tab)?.label}</span>
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">{h.query}</span>
              </div>
              <span className="text-[8px] font-mono text-[var(--text-muted)]">{h.time}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const OsintResults = memo(OsintResultsInner);
export default OsintResults;
