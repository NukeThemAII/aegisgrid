import { z } from 'zod';

/**
 * AegisGrid — Centralized Environment Configuration
 *
 * All environment variables are validated here with zod schemas.
 * Import `env` from this module instead of accessing `process.env` directly.
 *
 * Design decisions:
 *  - "required in production" vars are optional so local dev works with minimal config.
 *  - Boolean flags use the `.transform(v => v === 'true')` pattern.
 *  - Optional enrichment API keys are just `string | undefined`.
 *  - The parsed `env` object is frozen to prevent accidental mutation.
 */

// ── Helpers ──────────────────────────────────────────────────────

/** Trim and return undefined for empty strings */
const optionalTrimmed = z.string().optional().transform(v => v?.trim() || undefined);
const boolFlag = z.string().optional().default('false').transform(v => v === 'true');
const optionalPositiveInt = z.string().optional().transform(v => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
});

// ── Schema ───────────────────────────────────────────────────────

const envSchema = z.object({
  // ── App ──
  NEXT_PUBLIC_APP_NAME: optionalTrimmed.default('AegisGrid'),
  NEXT_PUBLIC_APP_URL: optionalTrimmed,
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),

  // ── Database ──
  DATABASE_URL: optionalTrimmed,
  DATABASE_POOL_MAX: optionalPositiveInt,

  // ── Redis / Cache ──
  REDIS_URL: optionalTrimmed,
  REDIS_CONNECT_TIMEOUT_MS: optionalPositiveInt,
  REDIS_COMMAND_TIMEOUT_MS: optionalPositiveInt,

  // ── Auth ──
  AUTH_SECRET: optionalTrimmed,
  AUTH_ADMIN_TOKEN: optionalTrimmed,
  AUTH_USER_TOKENS: optionalTrimmed,
  AUTH_USER_ENTITLEMENTS: optionalTrimmed,
  AUTH_STATIC_ENTITLEMENTS_FALLBACK: boolFlag,
  AUTH_GITHUB_ID: optionalTrimmed,
  AUTH_GITHUB_SECRET: optionalTrimmed,
  AUTH_GOOGLE_ID: optionalTrimmed,
  AUTH_GOOGLE_SECRET: optionalTrimmed,

  // ── Feature Flags ──
  FEATURE_AI_REPORTS: boolFlag,
  FEATURE_COMMS: boolFlag,
  FEATURE_PREMIUM: boolFlag,
  FEATURE_X402: boolFlag,

  // ── AI ──
  AI_PROVIDER: z.enum(['none', 'deterministic', 'openai', 'deepseek', 'gemini', 'hermes']).optional().default('none'),
  AI_MODEL_REPORTS: optionalTrimmed,
  OPENAI_API_KEY: optionalTrimmed,
  HERMES_API_KEY: optionalTrimmed,
  HERMES_API_URL: optionalTrimmed,

  // ── Scanner ──
  SCANNER_URL: optionalTrimmed,
  SCANNER_KEY: optionalTrimmed,
  SCANNER_ADMIN_TOKEN: optionalTrimmed,
  SCANNER_USER_TOKENS: optionalTrimmed,
  SCANNER_ALLOWED_TARGETS: optionalTrimmed,
  SCANNER_VERIFIED_TARGETS: optionalTrimmed,
  SCANNER_REQUIRE_VERIFICATION: boolFlag.default('true'),
  SCANNER_VERIFICATION_SECRET: optionalTrimmed,
  SCANNER_TARGETS_DIR: optionalTrimmed,
  SCANNER_ADMIN_ALLOWLIST_PATH: optionalTrimmed,
  SCANNER_V2_HOST: optionalTrimmed.default('127.0.0.1'),
  SCANNER_V2_PORT: optionalPositiveInt,
  SCANNER_AUDIT_PERSISTENCE: z.enum(['file', 'db', 'none']).optional().default('file'),
  SCANNER_AUDIT_LOG_PATH: optionalTrimmed,

  // ── Stripe ──
  STRIPE_SECRET_KEY: optionalTrimmed,
  STRIPE_WEBHOOK_SECRET: optionalTrimmed,
  STRIPE_LIVE_MODE: boolFlag,
  STRIPE_PRICE_PRO_MONTHLY: optionalTrimmed,
  STRIPE_PRICE_PRO_YEARLY: optionalTrimmed,
  STRIPE_PRICE_REPORT_PACK: optionalTrimmed,
  STRIPE_REPORT_PACK_CREDITS: optionalPositiveInt,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalTrimmed,

  // ── x402 / USDC ──
  X402_ENABLED: boolFlag,
  X402_RECEIVING_ADDRESS: optionalTrimmed,
  X402_FACILITATOR_URL: optionalTrimmed,
  X402_NETWORK: optionalTrimmed.default('eip155:8453'),
  X402_REPORT_PRICE_USDC: optionalTrimmed.default('1.00'),
  X402_API_PRICE_USDC: optionalTrimmed.default('0.05'),
  CDP_API_KEY_ID: optionalTrimmed,
  CDP_API_KEY_SECRET: optionalTrimmed,

  // ── Optional Enrichment API Keys ──
  NASA_FIRMS_MAP_KEY: optionalTrimmed,
  AISSTREAM_API_KEY: optionalTrimmed,
  OPENSKY_CLIENT_ID: optionalTrimmed,
  OPENSKY_CLIENT_SECRET: optionalTrimmed,
  VIRUSTOTAL_API_KEY: optionalTrimmed,
  ABUSEIPDB_API_KEY: optionalTrimmed,
  OTX_API_KEY: optionalTrimmed,
  URLSCAN_API_KEY: optionalTrimmed,
  CENSYS_API_ID: optionalTrimmed,
  CENSYS_API_SECRET: optionalTrimmed,
  GREYNOISE_API_KEY: optionalTrimmed,
  SHODAN_API_KEY: optionalTrimmed,
  N2YO_API_KEY: optionalTrimmed,
  IPCAMLIVE_API_SECRET: optionalTrimmed,

  // ── Jobs ──
  CRON_SECRET: optionalTrimmed,
});

// ── Parse ────────────────────────────────────────────────────────

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate all environment variables.
 * Cached after first call — safe to call repeatedly.
 * Throws with detailed errors if validation fails.
 */
export function parseEnv(overrides?: Record<string, string | undefined>): Env {
  if (_env && !overrides) return _env;

  const source = overrides ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const formatted = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[AEGISGRID] Environment validation failed:\n${formatted}`);
  }

  // Always update the cache so derived helpers (getEnv, isProduction, etc.)
  // see the latest parse result — important for tests using overrides.
  _env = Object.freeze(result.data);
  return _env;
}

/** Reset cached env — only for tests. */
export function resetEnvCache(): void {
  _env = null;
}

// ── Derived helpers ──────────────────────────────────────────────

/** Convenience: get parsed env (lazy singleton). */
export function getEnv(): Env {
  return parseEnv();
}

/** Check if we're running in production. */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/** Check if the database is configured. */
export function isDatabaseConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

/** Check if Redis is configured. */
export function isRedisConfigured(): boolean {
  return Boolean(getEnv().REDIS_URL);
}

/** Check if Stripe is fully configured for webhook processing. */
export function isStripeFullyConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET);
}

/** Check if x402 is enabled and configured. */
export function isX402Configured(): boolean {
  const e = getEnv();
  return e.X402_ENABLED && Boolean(e.X402_RECEIVING_ADDRESS && e.X402_FACILITATOR_URL);
}

/** Check if the active scanner proxy is configured. */
export function isScannerProxyConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.SCANNER_URL && e.SCANNER_KEY);
}

/** Check which AI provider is active. */
export function aiProviderName(): Env['AI_PROVIDER'] {
  return getEnv().AI_PROVIDER;
}
