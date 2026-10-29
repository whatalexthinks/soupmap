BEGIN;
CREATE TABLE IF NOT EXISTS growth_leads (
  id uuid PRIMARY KEY, email text NOT NULL, shop_slug text NOT NULL DEFAULT '', city text NOT NULL,
  marketing boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, delivery_started_at timestamptz, attempts integer NOT NULL DEFAULT 0,
  requested_day date NOT NULL DEFAULT CURRENT_DATE, UNIQUE(email,shop_slug,city,requested_day)
);
CREATE INDEX IF NOT EXISTS growth_leads_queue ON growth_leads(status,created_at);
CREATE TABLE IF NOT EXISTS restaurant_claims (
  id uuid PRIMARY KEY, shop_slug text NOT NULL, contact_name text NOT NULL, role text NOT NULL,
  email text NOT NULL, phone text NOT NULL, wants_badge boolean NOT NULL, wants_featured boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  UNIQUE(shop_slug,email)
);
CREATE TABLE IF NOT EXISTS account_passport (
  owner_id text NOT NULL, shop_slug text NOT NULL, visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,shop_slug)
);
COMMIT;
