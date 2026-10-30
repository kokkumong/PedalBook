-- PostgreSQL 16+ 대상 설계 예시. 실제 운영 반영 전 별도 DB에서 migration 검증 필요.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL CHECK (length(trim(brand)) > 0),
  model_name text NOT NULL CHECK (length(trim(model_name)) > 0),
  variant_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'unknown',
  width_mm numeric(9,3) NOT NULL CHECK (width_mm > 0 AND width_mm <= 5000),
  height_mm numeric(9,3) NOT NULL CHECK (height_mm > 0 AND height_mm <= 5000),
  dimension_basis text NOT NULL DEFAULT 'unknown'
    CHECK (dimension_basis IN ('envelope', 'enclosure', 'unknown')),
  image_url text,
  asset_rights_status text NOT NULL DEFAULT 'unverified'
    CHECK (asset_rights_status IN ('unverified', 'approved', 'restricted')),
  source_name text NOT NULL,
  source_key text NOT NULL,
  source_revision text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_name, source_key)
);
CREATE INDEX pedals_search_idx ON pedals USING gin
  ((brand || ' ' || model_name || ' ' || variant_name) gin_trgm_ops);

-- 표기 차이를 흡수하는 검색 사전. 색상/세대 통합은 검수 후 수행한다.
CREATE TABLE pedal_aliases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedal_id uuid NOT NULL REFERENCES pedals(id),
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('brand', 'model', 'search')),
  UNIQUE (pedal_id, normalized_alias, kind)
);

CREATE TABLE crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_key text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'blocked')),
  parser_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),
  rows_parsed integer NOT NULL DEFAULT 0 CHECK (rows_parsed >= 0),
  error_code text
);

CREATE TABLE mule_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_listing_id text NOT NULL UNIQUE,
  pedal_id uuid REFERENCES pedals(id), -- 미매칭 후보도 보존
  title text NOT NULL,
  listing_url text NOT NULL UNIQUE,
  price_krw bigint CHECK (price_krw > 0),
  price_kind text NOT NULL DEFAULT 'unknown'
    CHECK (price_kind IN ('fixed', 'negotiable', 'unknown')),
  sale_status text NOT NULL DEFAULT 'unknown'
    CHECK (sale_status IN ('active', 'reserved', 'sold', 'deleted', 'unknown')),
  listing_kind text NOT NULL DEFAULT 'unknown'
    CHECK (listing_kind IN ('sell', 'buy', 'trade', 'unknown')),
  is_bundle boolean NOT NULL DEFAULT false,
  match_confidence numeric(4,3) CHECK (match_confidence BETWEEN 0 AND 1),
  match_version text,
  reviewed_at timestamptz,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  latest_run_id uuid REFERENCES crawl_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_seen_at >= first_seen_at)
);
CREATE INDEX mule_active_idx ON mule_listings (pedal_id, last_checked_at DESC)
  WHERE sale_status = 'active' AND listing_kind = 'sell';
CREATE INDEX mule_published_idx ON mule_listings (pedal_id, published_at DESC);

-- 동일 게시글 재수집은 새 매물이 아니다. 관측 이력은 별도 기록한다.
CREATE TABLE listing_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES mule_listings(id),
  crawl_run_id uuid NOT NULL REFERENCES crawl_runs(id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  price_krw bigint CHECK (price_krw > 0),
  sale_status text NOT NULL
    CHECK (sale_status IN ('active', 'reserved', 'sold', 'deleted', 'unknown')),
  UNIQUE (listing_id, crawl_run_id)
);
CREATE INDEX observations_listing_time_idx ON listing_observations (listing_id, observed_at DESC);

CREATE TABLE boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  name text NOT NULL DEFAULT 'My Board',
  width_mm numeric(9,3) NOT NULL CHECK (width_mm > 0 AND width_mm <= 5000),
  height_mm numeric(9,3) NOT NULL CHECK (height_mm > 0 AND height_mm <= 5000),
  layout jsonb NOT NULL DEFAULT '{"schemaVersion":1,"items":[]}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(layout) = 'object'),
  CHECK (layout ? 'schemaVersion' AND layout->>'schemaVersion' = '1'),
  CHECK (layout ? 'items' AND jsonb_typeof(layout->'items') = 'array')
);
CREATE INDEX boards_owner_idx ON boards (user_id, updated_at DESC);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedals_updated BEFORE UPDATE ON pedals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listings_updated BEFORE UPDATE ON mule_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER boards_updated BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMIT;
