-- AegisGrid V2 commercial persistence foundation.
-- Apply manually with:
--   psql "$DATABASE_URL" -f db/schema.sql
-- or from docker compose:
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  subject_id text NOT NULL UNIQUE,
  email text UNIQUE,
  display_name text,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE TABLE IF NOT EXISTS entitlements (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  source text NOT NULL CHECK (source IN ('stripe', 'x402', 'admin', 'manual', 'system')),
  status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'revoked')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (capability <> '')
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_usdc numeric(18,6),
  credits_delta integer NOT NULL,
  reason text NOT NULL,
  external_ref text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id text NOT NULL UNIQUE,
  topic text NOT NULL,
  region text,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  model text NOT NULL,
  markdown text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('stripe', 'x402')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'processed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_subject_id
  ON users(subject_id);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_capability_status
  ON entitlements(user_id, capability, status, valid_until);

DROP INDEX IF EXISTS idx_entitlements_external_ref;
CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlements_external_ref
  ON entitlements(external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created_at
  ON credit_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_user_created_at
  ON reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_report_id
  ON reports(report_id);
