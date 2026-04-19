ALTER TABLE "matches" ADD COLUMN "winning_team" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "assists" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "move_speed" double precision DEFAULT 0 NOT NULL;
