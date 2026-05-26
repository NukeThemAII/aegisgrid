import { describe, expect, it, vi } from 'vitest';
import type { ReportProvider, FetchFn } from './provider-types';
import { HermesReportProvider } from './provider-hermes';

function makeConfig(fetchFn: FetchFn) {
  return {
    apiKey: 'hermes-test-key-not-real',
    model: 'hermes-report-v1',
    baseUrl: 'https://api.hermes.example/v1',
    fetch: fetchFn,
    maxTokens: 4096,
    timeoutMs: 30000,
  };
}

function makeValidHermesResponse(sources: Array<{ title: string; confidence: string }>) {
  const citations = sources.map((s, i) => ({
    index: i + 1,
    title: s.title,
    source: s.title,
    source_url: null,
    confidence: s.confidence,
  }));
  return {
    topic: 'Baltic Sea',
    region: 'Northern Europe',
    confidence: 'medium',
    markdown: [
      '# AegisGrid Situational Report: Baltic Sea',
      '## Executive Summary',
      'Brief summary of Baltic situation.',
      '## Key Findings',
      '- Shipping lane activity [1]',
      '## Timeline',
      '- Not Recorded unless timestamped source evidence is provided.',
      '## Localized Sensor Matrix',
      '- Source coverage summarized from provided evidence.',
      '## Uncertainty Analysis',
      'Limited source coverage.',
      '## Sensor Gaps / Not Recorded',
      '- Missing feeds remain Not Recorded.',
      '## Citations',
      ...citations.map((c) => `- [${c.index}] ${c.title}`),
    ].join('\n'),
    citations,
  };
}

function mockFetchSuccess(responseBody: unknown): FetchFn {
  return vi.fn(async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(responseBody) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function mockFetchError(status: number, body: unknown): FetchFn {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

function mockFetchNetworkError(): FetchFn {
  return vi.fn(async () => { throw new Error('Network error: ECONNREFUSED'); });
}

describe('HermesReportProvider', () => {
  const sources = [
    { title: 'Shipping data', summary: 'Baltic shipping lane status.', source: 'AIS', confidence: 'medium' as const },
  ];

  it('implements ReportProvider interface with name hermes', () => {
    const provider: ReportProvider = new HermesReportProvider(makeConfig(mockFetchSuccess({})));
    expect(provider.name).toBe('hermes');
  });

  it('generates a report from valid Hermes response', async () => {
    const validResponse = makeValidHermesResponse([{ title: 'Shipping data', confidence: 'medium' }]);
    const fetchFn = mockFetchSuccess(validResponse);
    const provider = new HermesReportProvider(makeConfig(fetchFn));

    const result = await provider.generateReport(
      { topic: 'Baltic Sea', region: 'Northern Europe', sources },
      { reportId: 'test_hermes_1', now: '2026-05-25T00:00:00Z' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.report_id).toBe('test_hermes_1');
      expect(result.report.model).toBe('hermes-report-v1');
      expect(result.report.markdown).toContain('Executive Summary');
    }

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('hermes.example');
    expect(init.headers['Authorization']).toBe('Bearer hermes-test-key-not-real');
  });

  it('rejects response missing required fields', async () => {
    const provider = new HermesReportProvider(makeConfig(
      mockFetchSuccess({ topic: 'Test', region: 'Not specified', confidence: 'low', markdown: 'Incomplete report', citations: [] }),
    ));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
  });

  it('handles API errors without leaking secrets', async () => {
    const provider = new HermesReportProvider(makeConfig(
      mockFetchError(500, { error: 'Internal server error' }),
    ));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_ERROR');
      expect(result.error).not.toContain('hermes-test-key-not-real');
    }
  });

  it('handles network errors gracefully', async () => {
    const provider = new HermesReportProvider(makeConfig(mockFetchNetworkError()));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NETWORK_ERROR');
  });

  it('does not leak API key in any error output', async () => {
    const provider = new HermesReportProvider(makeConfig(mockFetchNetworkError()));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    if (!result.ok) {
      expect(result.error).not.toContain('hermes-test-key-not-real');
    }
  });
});
