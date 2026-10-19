-- Development schema source. Replit Publish applies the development schema diff
-- to production; never execute DDL from the application or deploy build command.
CREATE TABLE IF NOT EXISTS personal_lists (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('saved','custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_lists_owner_idx ON personal_lists(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS personal_lists_saved_owner_idx ON personal_lists(owner_id) WHERE kind='saved';
CREATE TABLE IF NOT EXISTS personal_list_items (
  list_id uuid NOT NULL REFERENCES personal_lists(id) ON DELETE CASCADE,
  shop_slug text NOT NULL CHECK (char_length(shop_slug) BETWEEN 1 AND 160),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(list_id,shop_slug)
);
