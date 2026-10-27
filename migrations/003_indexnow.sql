-- Development schema source. Replit Publish applies the development schema diff
-- to production; never execute DDL from the application or deploy build command.
-- IndexNow: which sitemap URLs (and lastmod) were last accepted, so each publish
-- submits only pages that are new or changed.
CREATE TABLE IF NOT EXISTS indexnow_submissions (
  url text PRIMARY KEY CHECK (char_length(url) BETWEEN 1 AND 2048),
  lastmod text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now()
);
