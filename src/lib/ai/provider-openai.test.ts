import { describe, expect, it, vi } from 'vitest';
import type { ReportProvider, FetchFn } from './provider-types';
import { OpenAIReportProvider } from './provider-openai';

function makeConfig(fetchFn: FetchFn) {
  return {
    apiKey: 'test-key-not-real',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    fetch: fetchFn,
    maxTokens: 4096,
    timeoutMs: 30000,
  };
}

function makeValidAIResponse(sources: Array<{ title: string; confidence: string }>) {
  const citations = sources.map((s, i) => ({
    index: i + 1,
    title: s.title,
    source: s.title,
    source_url: null,
    confidence: s.confidence,
  }));
  return {
    topic: 'Strait of Hormuz',
    region: 'Gulf',
    confidence: 'medium',
    markdown: [
      '# AegisGrid Situational Report: Strait of Hormuz',
      '## Executive Summary',
      'This brief summarises provided sources.',
      '## Key Findings',
      '- Maritime activity observed [1]',
      '## Timeline',
      '- Not Recorded unless timestamped source evidence is provided.',
      '## Localized Sensor Matrix',
      '- Source coverage summarized from provided evidence.',
      '## Uncertainty Analysis',
      'Source coverage is limited.',
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
  return vi.fn(async () => { throw new Error('Network error: connection refused'); });
}

describe('OpenAIReportProvider', () => {
  const sources = [
    { title: 'Maritime AIS', summary: 'AIS data available.', source: 'AIS', confidence: 'medium' as const },
  ];

  it('implements ReportProvider interface', () => {
    const provider: ReportProvider = new OpenAIReportProvider(makeConfig(mockFetchSuccess({})));
    expect(provider.name).toBe('openai');
  });

  it('generates a report from valid AI response with matching citations', async () => {
    const validResponse = makeValidAIResponse([{ title: 'Maritime AIS', confidence: 'medium' }]);
    const fetchFn = mockFetchSuccess(validResponse);
    const provider = new OpenAIReportProvider(makeConfig(fetchFn));

    const result = await provider.generateReport(
      { topic: 'Strait of Hormuz', region: 'Gulf', sources },
      { reportId: 'test_openai_1', now: '2026-05-25T00:00:00Z' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.report_id).toBe('test_openai_1');
      expect(result.report.model).toBe('gpt-4o');
      expect(result.report.markdown).toContain('Executive Summary');
      expect(result.report.citations).toHaveLength(1);
    }

    // Verify fetch was called with correct URL and no leaked secrets in output
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('openai.com');
    expect(init.headers['Authorization']).toBe('Bearer test-key-not-real');
  });

  it('rejects AI response missing required sections', async () => {
    const incompleteResponse = {
      topic: 'Test',
      region: 'Not specified',
      confidence: 'low',
      markdown: 'Just some text without required sections.',
      citations: [],
    };
    const provider = new OpenAIReportProvider(makeConfig(mockFetchSuccess(incompleteResponse)));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
    }
  });

  it('rejects AI response with fabricated citations not in source list', async () => {
    const badCitations = {
      ...makeValidAIResponse([{ title: 'Maritime AIS', confidence: 'medium' }]),
      citations: [
        { index: 99, title: 'Fabricated Source', source: 'Invented', confidence: 'high' },
      ],
    };
    const provider = new OpenAIReportProvider(makeConfig(mockFetchSuccess(badCitations)));

    const result = await provider.generateReport({ topic: 'Hormuz', sources });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_CITATIONS');
    }
  });

  it('handles API errors gracefully with safe error response', async () => {
    const provider = new OpenAIReportProvider(makeConfig(
      mockFetchError(429, { error: { message: 'Rate limit exceeded' } }),
    ));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_ERROR');
      expect(result.error).not.toContain('test-key-not-real');
    }
  });

  it('handles network errors gracefully', async () => {
    const provider = new OpenAIReportProvider(makeConfig(mockFetchNetworkError()));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NETWORK_ERROR');
    }
  });

  it('does not leak API key in error responses', async () => {
    const provider = new OpenAIReportProvider(makeConfig(mockFetchNetworkError()));

    const result = await provider.generateReport({ topic: 'Test', sources: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain('test-key-not-real');
    }
  });

  it('sends system prompt with anti-injection instructions', async () => {
    const fetchFn = mockFetchSuccess(makeValidAIResponse([{ title: 'Maritime AIS', confidence: 'medium' }]));
    const provider = new OpenAIReportProvider(makeConfig(fetchFn));

    await provider.generateReport({ topic: 'Test', sources });

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('UNTRUSTED DATA');
    expect(systemMessage.content).toContain('MUST NOT override');
  });

  it('sanitises source text in user prompt before sending to API', async () => {
    const fetchFn = mockFetchSuccess(makeValidAIResponse([{ title: 'Bad Source', confidence: 'low' }]));
    const provider = new OpenAIReportProvider(makeConfig(fetchFn));

    await provider.generateReport({
      topic: 'Test',
      sources: [{ title: '<script>Bad Source</script>', summary: '<img onerror=alert(1)>Data', confidence: 'low' }],
    });

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).not.toContain('<script>');
    expect(userMessage.content).not.toContain('<img');
  });
});
