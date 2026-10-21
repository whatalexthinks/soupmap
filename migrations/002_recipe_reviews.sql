-- Development schema source. Replit Publish applies the development schema diff
-- to production; never execute DDL from the application or deploy build command.
-- Recipe reviews and cooks' tips: one entry per account per recipe, edited in place.
CREATE TABLE IF NOT EXISTS recipe_reviews (
  id uuid PRIMARY KEY,
  recipe_slug text NOT NULL CHECK (char_length(recipe_slug) BETWEEN 1 AND 120),
  owner_id text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  made_it boolean NOT NULL DEFAULT false,
  tip text NOT NULL DEFAULT '' CHECK (char_length(tip) <= 500),
  tip_kind text CHECK (tip_kind IN ('swap','technique','make-ahead','serving','other')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A star rating, a tip, or both.
  CHECK (rating IS NOT NULL OR tip <> ''),
  CHECK ((tip = '') = (tip_kind IS NULL)),
  UNIQUE (recipe_slug, owner_id)
);
CREATE INDEX IF NOT EXISTS recipe_reviews_recipe_idx ON recipe_reviews(recipe_slug, status);
CREATE TABLE IF NOT EXISTS recipe_review_votes (
  review_id uuid NOT NULL REFERENCES recipe_reviews(id) ON DELETE CASCADE,
  voter_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, voter_id)
);
CREATE TABLE IF NOT EXISTS recipe_review_reports (
  review_id uuid NOT NULL REFERENCES recipe_reviews(id) ON DELETE CASCADE,
  reporter_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam','offensive','unsafe','off-topic','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, reporter_id)
);
