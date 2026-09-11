-- Roundly database schema (PostgreSQL)
-- Designed for GDPR: explicit consent log, minimal PII, hard-delete cascade.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | paused | deleted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row of preferences per user
CREATE TABLE IF NOT EXISTS preferences (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  categories         TEXT[] NOT NULL DEFAULT ARRAY['world','politics','tech','sport'],
  region             TEXT   NOT NULL DEFAULT 'uk',
  language           TEXT   NOT NULL DEFAULT 'en',
  stories_per_section INT   NOT NULL DEFAULT 3 CHECK (stories_per_section BETWEEN 1 AND 8),
  balanced           BOOLEAN NOT NULL DEFAULT TRUE,
  timezone           TEXT   NOT NULL DEFAULT 'Europe/London',
  noon_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  noon_time          TIME    NOT NULL DEFAULT '12:00',
  evening_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  evening_time       TIME    NOT NULL DEFAULT '21:00',
  weekend_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  paused             BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Followed entities (people, teams, companies, topics)
CREATE TABLE IF NOT EXISTS follows (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

-- GDPR consent log: append-only, one row per consent event (proof of consent)
CREATE TABLE IF NOT EXISTS consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,           -- essential | personalisation | marketing
  granted     BOOLEAN NOT NULL,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-use tokens for email verification + unsubscribe (hashed)
CREATE TABLE IF NOT EXISTS tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,            -- verify | unsubscribe | password_reset
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delivery log (deduplication + auditing; no article bodies stored)
CREATE TABLE IF NOT EXISTS deliveries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,           -- noon | evening
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  story_count INT NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'sent'  -- sent | failed | skipped
);

CREATE INDEX IF NOT EXISTS idx_follows_user ON follows(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries(user_id);
