import { randomUUID } from 'node:crypto';
import type { GeneratedReport, SourceConfidence } from '@/lib/ai/report-generator';

export type EnrichmentTargetType = 'domain' | 'ip' | 'url' | 'cve' | 'feed' | 'text';

export interface EnrichmentObservationInput {
  title: string;
  summary: string;
  source?: string;
  source_url?: string;
  fetched_at?: string;
  confidence?: SourceConfidence;
}

export interface EnrichmentRequestInput {
  target_type: EnrichmentTargetType;
  target: string;
  observations: EnrichmentObservationInput[];
}

export interface GeneratedEnrichment {
  enrichment_id: string;
  target_type: EnrichmentTargetType;
  target: string;
  generated_at: string;
  model: 'aegisgrid-deterministic-enrichment-v1';
  confidence: SourceConfidence;
  summary: string;
  risk_signals: string[];
  normalized_sources: EnrichmentObservationInput[];
  citations: Array<{
    index: number;
    title: string;
    source: string;
    source_url: string | null;
    confidence: SourceConfidence;
  }>;
  limitations: string[];
}

export type EnrichmentParseResult =
  | { ok: true; value: EnrichmentRequestInput }
  | { ok: false; code: 'INVALID_TARGET_TYPE' | 'INVALID_TARGET' | 'INVALID_OBSERVATION'; error: string };

interface GenerationOptions {
  now?: string;
  enrichmentId?: string;
  reportId?: string;
}

const TARGET_TYPES: ReadonlySet<EnrichmentTargetType> = new Set(['domain', 'ip', 'url', 'cve', 'feed', 'text']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanUrl(value: unknown): string | undefined {
  const cleaned = cleanText(value, 500);
  if (!cleaned) return undefined;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function cleanConfidence(value: unknown): SourceConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function parseObservation(value: unknown): EnrichmentObservationInput | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title, 120);
  const summary = cleanText(value.summary, 1000);
  if (!title || !summary) return null;
  return {
    title,
    summary,
    ...(cleanText(value.source, 120) ? { source: cleanText(value.source, 120) } : {}),
    ...(cleanUrl(value.source_url) ? { source_url: cleanUrl(value.source_url) } : {}),
    ...(cleanText(value.fetched_at, 80) ? { fetched_at: cleanText(value.fetched_at, 80) } : {}),
    confidence: cleanConfidence(value.confidence),
  };
}

function isTargetType(value: string): value is EnrichmentTargetType {
  return TARGET_TYPES.has(value as EnrichmentTargetType);
}

export function parseEnrichmentRequest(input: unknown): EnrichmentParseResult {
  if (!isRecord(input)) {
    return { ok: false, code: 'INVALID_TARGET', error: 'Enrichment request must be a JSON object.' };
  }

  const targetType = cleanText(input.target_type, 40).toLowerCase();
  if (!isTargetType(targetType)) {
    return { ok: false, code: 'INVALID_TARGET_TYPE', error: 'target_type must be one of domain, ip, url, cve, feed, text.' };
  }

  const target = cleanText(input.target, 241);
  if (!target || target.length > 240) {
    return { ok: false, code: 'INVALID_TARGET', error: 'target must be 1-240 characters.' };
  }

  const rawObservations = Array.isArray(input.observations) ? input.observations.slice(0, 20) : [];
  const observations = rawObservations
    .map(parseObservation)
    .filter((source): source is EnrichmentObservationInput => Boolean(source));

  if (rawObservations.length > 0 && observations.length === 0) {
    return { ok: false, code: 'INVALID_OBSERVATION', error: 'At least one observation must include title and summary.' };
  }

  return {
    ok: true,
    value: {
      target_type: targetType,
      target,
      observations,
    },
  };
}

function aggregateConfidence(observations: EnrichmentObservationInput[]): SourceConfidence {
  if (observations.length === 0) return 'low';
  const score = observations.reduce((sum, observation) => {
    if (observation.confidence === 'high') return sum + 3;
    if (observation.confidence === 'medium') return sum + 2;
    return sum + 1;
  }, 0) / observations.length;
  if (score >= 2.5) return 'high';
  if (score >= 1.75) return 'medium';
  return 'low';
}

function deriveRiskSignals(target: string, observations: EnrichmentObservationInput[]): string[] {
  const haystack = `${target} ${observations.map((observation) => `${observation.title} ${observation.summary}`).join(' ')}`.toLowerCase();
  const signals: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/(critical|severe|emergency|catastrophic)/, 'high-severity language present in supplied observations'],
    [/(cve-\d{4}-\d+|vulnerab|exploit)/, 'vulnerability-related indicator present in supplied observations'],
    [/(malware|phishing|ransomware|botnet|abuse)/, 'threat-intelligence indicator present in supplied observations'],
    [/(outage|down|disrupt|degrad)/, 'availability/disruption indicator present in supplied observations'],
    [/(radiation|earthquake|fire|flood|storm)/, 'hazard/geospatial indicator present in supplied observations'],
  ];
  for (const [pattern, signal] of rules) {
    if (pattern.test(haystack)) signals.push(signal);
  }
  if (signals.length === 0) signals.push('no elevated risk keywords detected in supplied observations');
  return signals;
}

export function generateDeterministicEnrichment(
  request: EnrichmentRequestInput,
  options: GenerationOptions = {},
): GeneratedEnrichment {
  const normalized: EnrichmentRequestInput = {
    target_type: request.target_type,
    target: cleanText(request.target, 240),
    observations: request.observations.map((observation) => ({
      title: cleanText(observation.title, 120),
      summary: cleanText(observation.summary, 1000),
      ...(observation.source ? { source: cleanText(observation.source, 120) } : {}),
      ...(observation.source_url ? { source_url: cleanUrl(observation.source_url) ?? undefined } : {}),
      ...(observation.fetched_at ? { fetched_at: cleanText(observation.fetched_at, 80) } : {}),
      confidence: cleanConfidence(observation.confidence),
    })).filter((observation) => observation.title && observation.summary),
  };
  const generatedAt = options.now ?? new Date().toISOString();
  const confidence = aggregateConfidence(normalized.observations);
  const count = normalized.observations.length;

  return {
    enrichment_id: options.enrichmentId ?? `enrich_${randomUUID()}`,
    target_type: normalized.target_type,
    target: normalized.target,
    generated_at: generatedAt,
    model: 'aegisgrid-deterministic-enrichment-v1',
    confidence,
    summary: count > 0
      ? `A source-bounded enrichment for ${normalized.target} using ${count} supplied observation(s). No active scan or external lookup was performed.`
      : `A source-bounded enrichment for ${normalized.target} with no supplied observations. Treat findings as Not Recorded.`,
    risk_signals: deriveRiskSignals(normalized.target, normalized.observations),
    normalized_sources: normalized.observations,
    citations: normalized.observations.map((observation, index) => ({
      index: index + 1,
      title: observation.title,
      source: observation.source ?? 'AegisGrid',
      source_url: observation.source_url ?? null,
      confidence: observation.confidence ?? 'low',
    })),
    limitations: [
      'This enrichment is deterministic and source-bounded to the submitted observations.',
      'No active scanning, exploit testing, credential checks, or unauthorized probing was performed.',
      'Missing source payloads are represented as Not Recorded, not as evidence of absence.',
    ],
  };
}

export function enrichmentToReport(enrichment: GeneratedEnrichment, options: GenerationOptions = {}): GeneratedReport {
  const sourceLines = enrichment.normalized_sources.length > 0
    ? enrichment.normalized_sources.map((source, index) => `- ${source.title}: ${source.summary} [${index + 1}]`).join('\n')
    : '- Not Recorded: no observation payload supplied.';
  const citationLines = enrichment.citations.length > 0
    ? enrichment.citations.map((citation) => `- [${citation.index}] ${citation.title} — ${citation.source}${citation.source_url ? ` (${citation.source_url})` : ''}; confidence=${citation.confidence}`).join('\n')
    : '- No source citations supplied.';

  return {
    report_id: options.reportId ?? `report_${randomUUID()}`,
    status: 'completed',
    topic: `Data enrichment: ${enrichment.target}`,
    region: null,
    generated_at: enrichment.generated_at,
    model: enrichment.model,
    confidence: enrichment.confidence,
    markdown: [
      `# AegisGrid Source/Data Enrichment: ${enrichment.target}`,
      '',
      `Generated: ${enrichment.generated_at}`,
      `Target type: ${enrichment.target_type}`,
      `Confidence: ${enrichment.confidence}`,
      '',
      '## Summary',
      enrichment.summary,
      '',
      '## Risk Signals',
      enrichment.risk_signals.map((signal) => `- ${signal}`).join('\n'),
      '',
      '## Submitted Observations',
      sourceLines,
      '',
      '## Limitations',
      enrichment.limitations.map((limitation) => `- ${limitation}`).join('\n'),
      '',
      '## Citations',
      citationLines,
    ].join('\n'),
    citations: enrichment.citations,
  };
}
