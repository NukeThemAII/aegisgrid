/**
 * Provider abstraction types for AegisGrid AI report generation.
 *
 * Every report provider must implement `ReportProvider`. External providers
 * accept an injected fetch function so that tests can mock network calls
 * without hitting real APIs.
 */

import type { GeneratedReport, ReportRequestInput, ReportSourceInput, SourceConfidence } from './report-generator';

// ---------------------------------------------------------------------------
// Core provider contract
// ---------------------------------------------------------------------------

/** Discriminated union: provider generation succeeded or failed safely. */
export type ProviderResult =
  | { ok: true; report: GeneratedReport }
  | { ok: false; code: ProviderErrorCode; error: string };

export type ProviderErrorCode =
  | 'PROVIDER_ERROR'
  | 'RESPONSE_PARSE_ERROR'
  | 'MISSING_REQUIRED_FIELDS'
  | 'INVALID_CITATIONS'
  | 'NETWORK_ERROR'
  | 'PROVIDER_NOT_CONFIGURED';

/** The contract every AI report provider must implement. */
export interface ReportProvider {
  /** Human-readable provider name, e.g. 'deterministic', 'openai', 'hermes'. */
  readonly name: string;

  /** Generate a situational report from a parsed request and its sources. */
  generateReport(
    request: ReportRequestInput,
    options?: ReportGenerationOptions,
  ): Promise<ProviderResult>;
}

export interface ReportGenerationOptions {
  /** Override timestamp for deterministic testing. */
  now?: string;
  /** Override report ID for deterministic testing. */
  reportId?: string;
}

// ---------------------------------------------------------------------------
// External provider building blocks (dependency injection)
// ---------------------------------------------------------------------------

/** Injectable fetch function signature — mirrors global fetch. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Configuration for an external AI provider. */
export interface ExternalProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetch: FetchFn;
  /** Max response tokens. Providers should enforce a safe default. */
  maxTokens?: number;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Response validation types
// ---------------------------------------------------------------------------

/** Required sections in a provider-generated report. */
export const REQUIRED_REPORT_SECTIONS = [
  'Executive Summary',
  'Key Findings',
  'Timeline',
  'Localized Sensor Matrix',
  'Uncertainty Analysis',
  'Sensor Gaps / Not Recorded',
  'Citations',
] as const;

export type RequiredSection = typeof REQUIRED_REPORT_SECTIONS[number];

/** A validated citation from provider output. */
export interface ValidatedCitation {
  index: number;
  title: string;
  source: string;
  source_url: string | null;
  confidence: SourceConfidence;
}

// Re-export types consumers commonly need alongside provider types.
export type { GeneratedReport, ReportRequestInput, ReportSourceInput, SourceConfidence };
