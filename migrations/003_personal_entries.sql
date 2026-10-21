-- Private account data. No browser-local fallback for saves.
CREATE TABLE IF NOT EXISTS personal_entries (
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('visit','trip','recipe','draft')),
  entry_key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, kind, entry_key)
);
