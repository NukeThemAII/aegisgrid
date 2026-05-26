/**
 * Provider factory for AegisGrid AI report generation.
 *
 * Reads AI_PROVIDER from environment and returns the appropriate ReportProvider.
 * Fails closed if the requested provider is not configured (missing API key, etc.).
 *
 * SECURITY:
 * - Never returns a provider that would make unauthenticated API calls.
 * - Fails closed for unknown or misconfigured provider values.
 * - Does not log or return API keys.
 */

import type { FetchFn, ReportProvider } from './provider-types';
import { DeterministicReportProvider } from './provider-deterministic';
import { OpenAIReportProvider } from './provider-openai';
import { HermesReportProvider } from './provider-hermes';

export type ProviderFactoryResult =
  | { ok: true; provider: ReportProvider }
  | { ok: false; code: 'PROVIDER_NOT_CONFIGURED'; error: string };

export interface ProviderFactoryOptions {
  /** Override fetch for testing. If not provided, uses global fetch. */
  fetch?: FetchFn;
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const DEFAULT_HERMES_MODEL = 'hermes-report-v1';

function parseSafeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const localhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && localhost)) {
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Create a report provider based on AI_PROVIDER environment variable.
 * Fails closed if configuration is incomplete.
 */
export function createReportProvider(
  options: ProviderFactoryOptions = {},
): ProviderFactoryResult {
  const providerName = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const fetchFn = options.fetch ?? globalThis.fetch;

  switch (providerName) {
    case 'deterministic':
      return { ok: true, provider: new DeterministicReportProvider() };

    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return {
          ok: false,
          code: 'PROVIDER_NOT_CONFIGURED',
          error: 'AI_PROVIDER=openai requires OPENAI_API_KEY to be set.',
        };
      }
      return {
        ok: true,
        provider: new OpenAIReportProvider({
          apiKey,
          model: process.env.AI_MODEL_REPORTS?.trim() || DEFAULT_OPENAI_MODEL,
          baseUrl: DEFAULT_OPENAI_BASE_URL,
          fetch: fetchFn,
          maxTokens: 4096,
          timeoutMs: 60_000,
        }),
      };
    }

    case 'hermes': {
      const apiKey = process.env.HERMES_API_KEY?.trim();
      if (!apiKey) {
        return {
          ok: false,
          code: 'PROVIDER_NOT_CONFIGURED',
          error: 'AI_PROVIDER=hermes requires HERMES_API_KEY to be set.',
        };
      }
      const baseUrl = parseSafeBaseUrl(process.env.HERMES_API_URL);
      if (!baseUrl) {
        return {
          ok: false,
          code: 'PROVIDER_NOT_CONFIGURED',
          error: 'AI_PROVIDER=hermes requires HERMES_API_URL to be a valid HTTPS URL or localhost HTTP URL.',
        };
      }
      return {
        ok: true,
        provider: new HermesReportProvider({
          apiKey,
          model: process.env.AI_MODEL_REPORTS?.trim() || DEFAULT_HERMES_MODEL,
          baseUrl,
          fetch: fetchFn,
          maxTokens: 4096,
          timeoutMs: 60_000,
        }),
      };
    }

    case 'none':
    case '':
    default:
      return {
        ok: false,
        code: 'PROVIDER_NOT_CONFIGURED',
        error: `AI_PROVIDER="${providerName || 'none'}" is not a configured provider. Use deterministic, openai, or hermes.`,
      };
  }
}
