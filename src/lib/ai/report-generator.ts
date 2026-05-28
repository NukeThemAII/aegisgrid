import { randomUUID } from 'node:crypto';

export type SourceConfidence = 'low' | 'medium' | 'high';

export interface ReportSourceInput {
  title: string;
  summary: string;
  source?: string;
  source_url?: string;
  fetched_at?: string;
  confidence?: SourceConfidence;
}

export interface ReportRequestInput {
  topic: string;
  region?: string;
  sources: ReportSourceInput[];
}

export interface GeneratedReport {
  report_id: string;
  status: 'completed';
  topic: string;
  region: string | null;
  generated_at: string;
  model: string;
  confidence: SourceConfidence;
  markdown: string;
  citations: Array<{
    index: number;
    title: string;
    source: string;
    source_url: string | null;
    confidence: SourceConfidence;
  }>;
}

export type ReportParseResult =
  | { ok: true; value: ReportRequestInput }
  | { ok: false; code: 'INVALID_TOPIC' | 'INVALID_SOURCE'; error: string };

interface GenerationOptions {
  now?: string;
  reportId?: string;
}

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

function parseSource(value: unknown): ReportSourceInput | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title, 120);
  const summary = cleanText(value.summary, 900);
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

export function parseReportRequest(input: unknown): ReportParseResult {
  if (!isRecord(input)) {
    return { ok: false, code: 'INVALID_TOPIC', error: 'Report request must be a JSON object.' };
  }

  // Auto-generate topic from report type if no explicit topic provided
  const typeMap: Record<string, string> = {
    situational_briefing: 'Situational Intelligence Briefing',
    threat_assessment: 'Threat Assessment Report',
    regional_analysis: 'Regional Analysis',
    sensor_summary: 'Sensor Network Summary',
    custom: 'Custom Intelligence Report',
  };
  let topic = cleanText(input.topic, 181);
  if (!topic && typeof input.type === 'string') {
    topic = typeMap[input.type] || `AegisGrid ${input.type.replace(/_/g, ' ')}`;
  }
  if (!topic) topic = 'AegisGrid Intelligence Report';
  if (topic.length > 180) topic = topic.slice(0, 180);
  if (topic.length < 1) topic = 'AegisGrid Intelligence Report';

  const rawSources = Array.isArray(input.sources) ? input.sources.slice(0, 12) : [];
  const sources = rawSources
    .map(parseSource)
    .filter((source): source is ReportSourceInput => Boolean(source));

  if (rawSources.length > 0 && sources.length === 0) {
    return { ok: false, code: 'INVALID_SOURCE', error: 'At least one provided source must include title and summary.' };
  }

  const region = cleanText(input.region, 120);
  return {
    ok: true,
    value: {
      topic,
      ...(region ? { region } : {}),
      sources,
    },
  };
}

function aggregateConfidence(sources: ReportSourceInput[]): SourceConfidence {
  if (sources.length === 0) return 'low';
  const score = sources.reduce((sum, source) => {
    if (source.confidence === 'high') return sum + 3;
    if (source.confidence === 'medium') return sum + 2;
    return sum + 1;
  }, 0) / sources.length;
  if (score >= 2.5) return 'high';
  if (score >= 1.75) return 'medium';
  return 'low';
}

function citationLines(sources: ReportSourceInput[]): string[] {
  if (sources.length === 0) {
    return ['- No live source citations supplied. Mark all sensor claims as Not Recorded.'];
  }

  return sources.map((source, index) => {
    const citation = source.source_url ? ` (${source.source_url})` : '';
    return `- [${index + 1}] ${source.title} — ${source.source ?? 'AegisGrid'}${citation}; confidence=${source.confidence ?? 'low'}`;
  });
}

export function generateDeterministicReport(
  request: ReportRequestInput,
  options: GenerationOptions = {},
): GeneratedReport {
  const sanitizedRequest: ReportRequestInput = {
    topic: cleanText(request.topic, 180),
    ...(request.region ? { region: cleanText(request.region, 120) } : {}),
    sources: request.sources.map((source) => ({
      title: cleanText(source.title, 120),
      summary: cleanText(source.summary, 900),
      ...(source.source ? { source: cleanText(source.source, 120) } : {}),
      ...(source.source_url ? { source_url: cleanUrl(source.source_url) ?? undefined } : {}),
      ...(source.fetched_at ? { fetched_at: cleanText(source.fetched_at, 80) } : {}),
      confidence: cleanConfidence(source.confidence),
    })).filter((source) => source.title && source.summary),
  };
  const generatedAt = options.now ?? new Date().toISOString();
  const reportId = options.reportId ?? `report_${randomUUID()}`;
  const confidence = aggregateConfidence(sanitizedRequest.sources);
  const sourceFindings = sanitizedRequest.sources.length > 0
    ? sanitizedRequest.sources.map((source, index) => `- ${source.title}: ${source.summary} [${index + 1}]`).join('\n')
    : '- Not Recorded: No source payload was provided for this report.';

  const markdown = [
    `# AegisGrid Situational Report: ${sanitizedRequest.topic}`,
    '',
    `Generated: ${generatedAt}`,
    `Region: ${sanitizedRequest.region ?? 'Not Recorded'}`,
    `Confidence: ${confidence}`,
    '',
    '## Executive Summary',
    sanitizedRequest.sources.length > 0
      ? `This source-bounded brief summarizes ${sanitizedRequest.sources.length} provided data source(s). It does not infer facts beyond the supplied payload.`
      : 'Low confidence: no live source payload was provided. Treat all operational details as Not Recorded.',
    '',
    '## Key Findings',
    sourceFindings,
    '',
    '## Localized Sensor Matrix',
    sanitizedRequest.sources.length > 0
      ? sanitizedRequest.sources.map((source) => `- ${source.title}: confidence=${source.confidence ?? 'low'}; fetched_at=${source.fetched_at ?? 'Not Recorded'}`).join('\n')
      : '- Not Recorded: balloons/radiation/AIS/comms source payloads absent.',
    '',
    '## Uncertainty Analysis',
    confidence === 'low'
      ? 'Low Confidence / Sensor Gaps: one or more feeds are placeholders, disabled, or not connected. Do not extrapolate activity from missing data.'
      : 'Confidence reflects only supplied source quality. Missing feeds remain Not Recorded.',
    '',
    '## Sensor Gaps / Not Recorded',
    '- Balloons/radiosondes: Not Recorded unless a lawful adapter payload was supplied.',
    '- Radiation: Not Recorded unless a lawful adapter payload was supplied.',
    '- AIS: Not Recorded unless a connected AIS adapter payload was supplied.',
    '- Comms: Not Recorded unless enabled registry/source payloads were supplied.',
    '',
    '## Citations',
    citationLines(sanitizedRequest.sources).join('\n'),
  ].join('\n');

  return {
    report_id: reportId,
    status: 'completed',
    topic: sanitizedRequest.topic,
    region: sanitizedRequest.region ?? null,
    generated_at: generatedAt,
    model: 'aegisgrid-deterministic-report-v1',
    confidence,
    markdown,
    citations: sanitizedRequest.sources.map((source, index) => ({
      index: index + 1,
      title: source.title,
      source: source.source ?? 'AegisGrid',
      source_url: source.source_url ?? null,
      confidence: source.confidence ?? 'low',
    })),
  };
}

export function getAiProviderStatus(): { enabled: boolean; provider: string; configured: boolean } {
  const enabled = process.env.FEATURE_AI_REPORTS === 'true';
  const provider = (process.env.AI_PROVIDER || 'none').trim() || 'none';
  const configured = enabled && (
    provider === 'deterministic'
      || (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY?.trim()))
      || (provider === 'hermes' && Boolean(process.env.HERMES_API_KEY?.trim()) && Boolean(process.env.HERMES_API_URL?.trim()))
  );
  return { enabled, provider, configured };
}
