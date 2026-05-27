import { describe, expect, it } from 'vitest';
import type { ReportProvider } from './provider-types';
import { DeterministicReportProvider } from './provider-deterministic';
import { generateDeterministicReport } from './report-generator';

describe('DeterministicReportProvider', () => {
  it('implements the ReportProvider interface', () => {
    const provider: ReportProvider = new DeterministicReportProvider();
    expect(provider.name).toBe('deterministic');
    expect(typeof provider.generateReport).toBe('function');
  });

  it('produces identical output to generateDeterministicReport', async () => {
    const provider = new DeterministicReportProvider();
    const request = {
      topic: 'Strait of Hormuz',
      region: 'Gulf chokepoint',
      sources: [
        {
          title: 'Maritime status',
          summary: 'AIS adapter configured but not connected.',
          source: 'AegisGrid AIS readiness',
          source_url: 'https://aisstream.io/',
          confidence: 'low' as const,
        },
      ],
    };
    const options = { now: '2026-05-25T00:00:00.000Z', reportId: 'report_det_1' };

    const providerResult = await provider.generateReport(request, options);
    const directResult = generateDeterministicReport(request, options);

    expect(providerResult.ok).toBe(true);
    if (providerResult.ok) {
      expect(providerResult.report).toEqual(directResult);
    }
  });

  it('always returns ok: true for valid input', async () => {
    const provider = new DeterministicReportProvider();
    const result = await provider.generateReport({ topic: 'Test', sources: [] });
    expect(result.ok).toBe(true);
  });

  it('preserves model name as aegisgrid-deterministic-report-v1', async () => {
    const provider = new DeterministicReportProvider();
    const result = await provider.generateReport({ topic: 'Test', sources: [] });
    if (result.ok) {
      expect(result.report.model).toBe('aegisgrid-deterministic-report-v1');
    }
  });

  it('generates report successfully with undefined options', async () => {
    const provider = new DeterministicReportProvider();
    const result = await provider.generateReport({ topic: 'Test Options', sources: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.report_id).toMatch(/^report_/);
      expect(typeof result.report.generated_at).toBe('string');
      expect(result.report.region).toBeNull();
    }
  });

  it('generates report successfully with empty sources and missing region', async () => {
    const provider = new DeterministicReportProvider();
    const result = await provider.generateReport({ topic: 'Sparse Report', sources: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.confidence).toBe('low');
      expect(result.report.markdown).toContain('Region: Not Recorded');
      expect(result.report.markdown).toContain('Not Recorded: balloons/radiation/AIS/comms source payloads absent.');
      expect(result.report.citations).toHaveLength(0);
    }
  });
});
