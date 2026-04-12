-- VG Dashboard schema (generated from Drizzle migration)

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "player_uuid" text NOT NULL,
  "player_handle" text NOT NULL,
  "client_ip" text NOT NULL,
  "country" text,
  "lat" double precision,
  "lng" double precision,
  "connected_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "is_online" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id"),
  "match_id" text NOT NULL,
  "game_mode" text,
  "status" text DEFAULT 'live' NOT NULL,
  "real_host" text,
  "real_port" integer,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "duration_s" double precision,
  "total_packets" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "match_players" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer NOT NULL REFERENCES "matches"("id"),
  "slot" integer NOT NULL,
  "handle" text,
  "team" integer,
  "entity_id" integer,
  "kills" integer DEFAULT 0 NOT NULL,
  "deaths" integer DEFAULT 0 NOT NULL,
  "cs" integer DEFAULT 0 NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "gold" integer DEFAULT 0 NOT NULL,
  "xp" double precision DEFAULT 0 NOT NULL,
  "pos_x" double precision DEFAULT 0 NOT NULL,
  "pos_y" double precision DEFAULT 0 NOT NULL,
  "items_bought" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "match_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" integer NOT NULL REFERENCES "matches"("id"),
  "time_s" double precision NOT NULL,
  "event_type" text NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rpc_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id"),
  "ts" timestamp with time zone NOT NULL,
  "method" text NOT NULL,
  "category" text,
  "status" integer,
  "url" text,
  "host" text,
  "req" jsonb,
  "res" jsonb,
  "extracted" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_player_uuid_idx" ON "users" ("player_uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "matches_match_id_idx" ON "matches" ("match_id");
CREATE UNIQUE INDEX IF NOT EXISTS "match_players_match_slot_idx" ON "match_players" ("match_id", "slot");

-- Match player stat columns (added for POC parity)
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS in_combat boolean DEFAULT false NOT NULL;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS energy_regen double precision DEFAULT 0 NOT NULL;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS energy_delta double precision DEFAULT 0 NOT NULL;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS hp_delta double precision DEFAULT 0 NOT NULL;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS ability_cd double precision DEFAULT 0 NOT NULL;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS gold_spent double precision DEFAULT 0 NOT NULL;
