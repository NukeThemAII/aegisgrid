import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReportProvider } from './provider-factory';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HERMES_API_KEY;
  delete process.env.HERMES_API_URL;
  delete process.env.AI_MODEL_REPORTS;
  delete process.env.FEATURE_AI_REPORTS;
});

describe('provider-factory', () => {
  it('returns deterministic provider for AI_PROVIDER=deterministic', () => {
    process.env.AI_PROVIDER = 'deterministic';
    const result = createReportProvider();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider.name).toBe('deterministic');
    }
  });

  it('returns openai provider when AI_PROVIDER=openai and OPENAI_API_KEY is set', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const result = createReportProvider();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider.name).toBe('openai');
    }
  });

  it('returns hermes provider when AI_PROVIDER=hermes and Hermes endpoint/key are set', () => {
    process.env.AI_PROVIDER = 'hermes';
    process.env.HERMES_API_KEY = 'hermes-test-key';
    process.env.HERMES_API_URL = 'https://hermes.local/v1';
    const result = createReportProvider();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider.name).toBe('hermes');
    }
  });

  it('fails closed for AI_PROVIDER=none', () => {
    process.env.AI_PROVIDER = 'none';
    const result = createReportProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
    }
  });

  it('fails closed for unknown provider values', () => {
    process.env.AI_PROVIDER = 'unknown-provider';
    const result = createReportProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
    }
  });

  it('fails closed when openai provider has no API key', () => {
    process.env.AI_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    const result = createReportProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(result.error).toContain('OPENAI_API_KEY');
    }
  });

  it('fails closed when hermes provider has no API key or URL', () => {
    process.env.AI_PROVIDER = 'hermes';
    delete process.env.HERMES_API_KEY;
    delete process.env.HERMES_API_URL;
    const missingKey = createReportProvider();
    expect(missingKey.ok).toBe(false);
    if (!missingKey.ok) {
      expect(missingKey.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(missingKey.error).toContain('HERMES_API_KEY');
    }

    process.env.HERMES_API_KEY = 'hermes-test-key';
    const missingUrl = createReportProvider();
    expect(missingUrl.ok).toBe(false);
    if (!missingUrl.ok) {
      expect(missingUrl.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(missingUrl.error).toContain('HERMES_API_URL');
    }
  });

  it('fails closed when AI_PROVIDER env is not set', () => {
    delete process.env.AI_PROVIDER;
    const result = createReportProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
    }
  });

  it('uses AI_MODEL_REPORTS for openai model override', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AI_MODEL_REPORTS = 'gpt-4o-mini';
    const result = createReportProvider();
    expect(result.ok).toBe(true);
    // The provider should use the specified model — we'll test it via the provider name
    // (the actual model usage is tested in provider-openai.test.ts)
  });

  it('accepts custom fetch override for testing', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const customFetch = vi.fn();
    const result = createReportProvider({ fetch: customFetch });
    expect(result.ok).toBe(true);
  });
});
