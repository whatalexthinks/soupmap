CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  receipt_hash TEXT NOT NULL,
  shop TEXT NOT NULL,
  city TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('order','tip','observation','correction','place')),
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  place_name TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS contributions_public ON contributions(status,shop,created_at);
CREATE TABLE IF NOT EXISTS contribution_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
