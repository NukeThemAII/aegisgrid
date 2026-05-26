/**
 * Deterministic report provider adapter.
 *
 * Wraps the existing `generateDeterministicReport` function as a ReportProvider
 * for use in the provider abstraction. Zero external dependencies, zero network
 * calls, identical output to the direct function.
 */

import type { ReportProvider, ProviderResult, ReportGenerationOptions } from './provider-types';
import type { ReportRequestInput } from './report-generator';
import { generateDeterministicReport } from './report-generator';

export class DeterministicReportProvider implements ReportProvider {
  readonly name = 'deterministic' as const;

  async generateReport(
    request: ReportRequestInput,
    options?: ReportGenerationOptions,
  ): Promise<ProviderResult> {
    const report = generateDeterministicReport(request, options);
    return { ok: true, report };
  }
}
