import { databaseProvider, isDatabaseConfigured } from '@/lib/db/postgres';

type ServiceStatus = 'configured' | 'unconfigured';

type RedisStatus = 'memory_fallback' | 'redis_configured_memory_fallback';

type AisStatus = 'api_key_missing' | 'configured_not_connected';

export interface PlatformStatus {
  generated_at: string;
  auth: {
    token_auth_configured: boolean;
    admin_token_configured: boolean;
    oauth: {
      github_configured: boolean;
      google_configured: boolean;
      status: 'planned' | 'provider_configured';
    };
  };
  database: {
    status: ServiceStatus;
    provider: string | null;
    persistence: 'wired' | 'planned';
  };
  redis: {
    status: RedisStatus;
    queue: 'not_wired' | 'planned';
  };
  ai: {
    enabled: boolean;
    provider: string;
    configured: boolean;
  };
  billing: {
    premium_enabled: boolean;
    stripe_configured: boolean;
    x402_enabled: boolean;
    x402_configured: boolean;
    entitlement_store: 'database' | 'static_env' | 'planned_database';
  };
  feeds: {
    balloons: { status: 'source_unavailable' };
    radiation: { status: 'source_unavailable' };
    ais: { status: AisStatus };
  };
  comms: {
    enabled: boolean;
  };
}

function flagEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function aiProviderConfigured(provider: string): boolean {
  switch (provider) {
    case 'deterministic':
      return true;
    case 'openai':
      return configured(process.env.OPENAI_API_KEY);
    case 'hermes':
      return configured(process.env.HERMES_API_KEY);
    default:
      return false;
  }
}

export function getPlatformStatus(now = new Date().toISOString()): PlatformStatus {
  const aiEnabled = flagEnabled(process.env.FEATURE_AI_REPORTS);
  const provider = (process.env.AI_PROVIDER || 'none').trim() || 'none';
  const githubConfigured = configured(process.env.AUTH_GITHUB_ID) && configured(process.env.AUTH_GITHUB_SECRET);
  const googleConfigured = configured(process.env.AUTH_GOOGLE_ID) && configured(process.env.AUTH_GOOGLE_SECRET);
  const x402Enabled = flagEnabled(process.env.X402_ENABLED) || flagEnabled(process.env.FEATURE_X402);
  const databaseConfigured = isDatabaseConfigured();

  return {
    generated_at: now,
    auth: {
      token_auth_configured: configured(process.env.AUTH_USER_TOKENS),
      admin_token_configured: configured(process.env.AUTH_ADMIN_TOKEN),
      oauth: {
        github_configured: githubConfigured,
        google_configured: googleConfigured,
        status: githubConfigured || googleConfigured ? 'provider_configured' : 'planned',
      },
    },
    database: {
      status: databaseConfigured ? 'configured' : 'unconfigured',
      provider: databaseProvider(process.env.DATABASE_URL),
      persistence: databaseConfigured ? 'wired' : 'planned',
    },
    redis: {
      status: configured(process.env.REDIS_URL) ? 'redis_configured_memory_fallback' : 'memory_fallback',
      queue: configured(process.env.REDIS_URL) ? 'not_wired' : 'planned',
    },
    ai: {
      enabled: aiEnabled,
      provider,
      configured: aiEnabled && aiProviderConfigured(provider),
    },
    billing: {
      premium_enabled: flagEnabled(process.env.FEATURE_PREMIUM),
      stripe_configured: configured(process.env.STRIPE_SECRET_KEY)
        && (configured(process.env.STRIPE_PRICE_PRO_MONTHLY) || configured(process.env.STRIPE_PRICE_REPORT_PACK) || configured(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)),
      x402_enabled: x402Enabled,
      x402_configured: x402Enabled && configured(process.env.X402_RECEIVING_ADDRESS) && configured(process.env.X402_FACILITATOR_URL),
      entitlement_store: databaseConfigured
        ? 'database'
        : configured(process.env.AUTH_USER_ENTITLEMENTS) ? 'static_env' : 'planned_database',
    },
    feeds: {
      balloons: { status: 'source_unavailable' },
      radiation: { status: 'source_unavailable' },
      ais: { status: configured(process.env.AISSTREAM_API_KEY) ? 'configured_not_connected' : 'api_key_missing' },
    },
    comms: {
      enabled: flagEnabled(process.env.FEATURE_COMMS),
    },
  };
}
