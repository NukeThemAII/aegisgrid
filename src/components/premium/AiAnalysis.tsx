'use client';

import { useState } from 'react';
import { Zap, Loader2, Brain, TrendingUp, AlertTriangle } from 'lucide-react';

interface AnalysisResult {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  trends: string[];
  recommendations: string[];
}

export default function AiAnalysis() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('aegisgrid_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'situational_briefing' }),
      });
      const data = await res.json();

      if (data.report?.markdown) {
        // Parse the markdown report into structured analysis
        const md = data.report.markdown;
        setResult({
          summary: extractSection(md, 'Executive Summary'),
          riskLevel: data.report.confidence === 'high' ? 'critical' : data.report.confidence === 'medium' ? 'high' : 'medium',
          trends: extractBullets(md, 'Key Findings'),
          recommendations: extractBullets(md, 'Uncertainty Analysis').filter(b => b.length > 20).slice(0, 5),
        });
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (!result && !loading && !error) {
    return (
      <div className="text-center py-8">
        <Brain size={32} className="mx-auto mb-3 text-[var(--cyan-primary)] opacity-50" />
        <p className="text-sm font-mono text-[var(--text-muted)] mb-4">Run AI analysis on current OSINT sensor data</p>
        <button onClick={runAnalysis}
          className="px-6 py-2.5 rounded text-sm font-mono font-bold bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/30 hover:bg-[var(--cyan-primary)]/30 transition-all">
          <Zap size={14} className="inline mr-2" />
          ANALYZE NOW
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 size={32} className="mx-auto mb-3 text-[var(--cyan-primary)] animate-spin" />
        <p className="text-sm font-mono text-[var(--text-muted)]">DeepSeek is analyzing sensor data...</p>
        <p className="text-xs font-mono text-[var(--text-muted)]/60 mt-1">Earthquakes · Fires · Threats · Space Weather</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle size={24} className="mx-auto mb-2 text-red-400" />
        <p className="text-sm font-mono text-red-400 mb-2">{error}</p>
        <button onClick={runAnalysis} className="text-xs font-mono text-[var(--gold-primary)] hover:underline">RETRY</button>
      </div>
    );
  }

  if (!result) return null;

  const riskColors = {
    low: 'text-green-400 bg-green-500/10 border-green-500/20',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <div className="space-y-4">
      {/* Risk Level */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono tracking-wider text-[var(--text-muted)]">AI ANALYSIS RESULTS</h3>
        <span className={`px-3 py-1 rounded text-xs font-mono font-bold border ${riskColors[result.riskLevel]}`}>
          {result.riskLevel.toUpperCase()} RISK
        </span>
      </div>

      {/* Summary */}
      <div className="border border-[var(--border-primary)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-[var(--cyan-primary)]" />
          <span className="text-xs font-mono font-bold text-white tracking-wider">EXECUTIVE SUMMARY</span>
        </div>
        <p className="text-xs font-mono text-[var(--text-primary)] leading-relaxed">{result.summary}</p>
      </div>

      {/* Trends */}
      {result.trends.length > 0 && (
        <div className="border border-[var(--border-primary)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-[var(--gold-primary)]" />
            <span className="text-xs font-mono font-bold text-white tracking-wider">KEY FINDINGS</span>
          </div>
          <ul className="space-y-1.5">
            {result.trends.map((t, i) => (
              <li key={i} className="text-xs font-mono text-[var(--text-primary)] flex gap-2">
                <span className="text-[var(--gold-primary)] shrink-0">▸</span>
                {t.replace(/^[-•*]\s*/, '')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Run Again */}
      <button onClick={runAnalysis}
        className="w-full py-2 rounded text-xs font-mono text-[var(--text-muted)] border border-[var(--border-primary)] hover:text-white hover:border-[var(--cyan-primary)]/30 transition-colors">
        RUN NEW ANALYSIS
      </button>
    </div>
  );
}

// ── Markdown Parsing Helpers ────────────────────────────────────────

function extractSection(md: string, heading: string): string {
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = md.match(regex);
  return match?.[1]?.trim() || 'No data available.';
}

function extractBullets(md: string, heading: string): string[] {
  const section = extractSection(md, heading);
  return section
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
    .map(line => line.trim().replace(/^[-*]\s*/, ''))
    .filter(b => b.length > 0);
}
