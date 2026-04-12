CREATE TABLE "match_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"time_s" double precision NOT NULL,
	"event_type" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
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
--> statement-breakpoint
CREATE TABLE "rpc_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
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
--> statement-breakpoint
CREATE TABLE "users" (
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
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpc_logs" ADD CONSTRAINT "rpc_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_slot_idx" ON "match_players" USING btree ("match_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_match_id_idx" ON "matches" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_player_uuid_idx" ON "users" USING btree ("player_uuid");