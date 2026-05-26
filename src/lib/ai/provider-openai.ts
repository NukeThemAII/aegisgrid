/**
 * OpenAI report provider.
 *
 * Uses dependency-injected fetch to call the OpenAI chat completions API.
 * All source text is sanitised before embedding in prompts. Response output
 * is validated for required sections and citation integrity before returning.
 *
 * Does NOT use the `openai` npm package — uses raw fetch with DI for
 * maximum testability and minimal dependency footprint in this foundation slice.
 *
 * SECURITY:
 * - API key is never included in error messages or returned to callers.
 * - Source text is treated as untrusted data per prompt-safety module.
 */

import { randomUUID } from 'node:crypto';
import type {
  ExternalProviderConfig,
  ProviderResult,
  ReportGenerationOptions,
  ReportProvider,
  ReportRequestInput,
} from './provider-types';
import { buildSystemPrompt, buildUserPrompt, parseProviderResponse } from './prompt-safety';

export class OpenAIReportProvider implements ReportProvider {
  readonly name = 'openai' as const;
  private readonly config: ExternalProviderConfig;

  constructor(config: ExternalProviderConfig) {
    this.config = config;
  }

  async generateReport(
    request: ReportRequestInput,
    options?: ReportGenerationOptions,
  ): Promise<ProviderResult> {
    const reportId = options?.reportId ?? `report_${randomUUID()}`;
    const generatedAt = options?.now ?? new Date().toISOString();

    try {
      const response = await this.callAPI(request);

      if (!response.ok) {
        // Redact any potential key leakage from error body
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          error: `OpenAI API returned status ${response.status}. Report generation failed.`,
        };
      }

      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        return {
          ok: false,
          code: 'RESPONSE_PARSE_ERROR',
          error: 'OpenAI response did not contain expected message content.',
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          ok: false,
          code: 'RESPONSE_PARSE_ERROR',
          error: 'OpenAI response content is not valid JSON.',
        };
      }

      return parseProviderResponse(parsed, request.sources, {
        reportId,
        generatedAt,
        model: this.config.model,
      });
    } catch {
      // Network-level errors may include request metadata in some runtimes; never echo them.
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        error: 'OpenAI request failed. Report generation failed.',
      };
    }
  }

  private async callAPI(request: ReportRequestInput): Promise<Response> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(request) },
      ],
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    };

    return this.config.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: this.config.timeoutMs
        ? AbortSignal.timeout(this.config.timeoutMs)
        : undefined,
    });
  }
}
