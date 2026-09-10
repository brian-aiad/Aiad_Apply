-- Additive and idempotent. Does not change or remove existing application data.
BEGIN;
CREATE TABLE IF NOT EXISTS artifact_backups (
  artifact_id uuid PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS discovery_postings (
  id text PRIMARY KEY,
  source_key text NOT NULL,
  external_id text NOT NULL,
  company text NOT NULL,
  title text NOT NULL,
  location text NOT NULL,
  source_url text NOT NULL UNIQUE,
  description text NOT NULL,
  employment_type text NOT NULL,
  work_arrangement text NOT NULL,
  salary_min double precision,
  salary_max double precision,
  salary_text text,
  distance_miles double precision,
  score integer NOT NULL,
  match_reasons jsonb NOT NULL,
  cautions jsonb NOT NULL,
  qualified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  posted_at timestamp(3),
  first_seen_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at timestamp(3),
  approved_application_id uuid
);
CREATE INDEX IF NOT EXISTS discovery_postings_source_key_active_idx ON discovery_postings(source_key, active);
CREATE INDEX IF NOT EXISTS discovery_postings_active_qualified_score_idx ON discovery_postings(active, qualified, score);
CREATE INDEX IF NOT EXISTS discovery_postings_first_seen_at_idx ON discovery_postings(first_seen_at);
COMMIT;
