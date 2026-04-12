import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    playerUuid: text("player_uuid").notNull(),
    playerHandle: text("player_handle").notNull(),
    clientIp: text("client_ip").notNull(),
    country: text("country"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isOnline: boolean("is_online").default(false).notNull(),
  },
  (t) => [uniqueIndex("users_player_uuid_idx").on(t.playerUuid)]
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    matchId: text("match_id").notNull(),
    gameMode: text("game_mode"),
    status: text("status").default("live").notNull(),
    realHost: text("real_host"),
    realPort: integer("real_port"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationS: doublePrecision("duration_s"),
    totalPackets: integer("total_packets").default(0).notNull(),
  },
  (t) => [uniqueIndex("matches_match_id_idx").on(t.matchId)]
);

export const matchPlayers = pgTable(
  "match_players",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .references(() => matches.id)
      .notNull(),
    slot: integer("slot").notNull(),
    handle: text("handle"),
    team: integer("team"),
    entityId: integer("entity_id"),
    kills: integer("kills").default(0).notNull(),
    deaths: integer("deaths").default(0).notNull(),
    cs: integer("cs").default(0).notNull(),
    level: integer("level").default(1).notNull(),
    gold: integer("gold").default(0).notNull(),
    xp: doublePrecision("xp").default(0).notNull(),
    posX: doublePrecision("pos_x").default(0).notNull(),
    posY: doublePrecision("pos_y").default(0).notNull(),
    itemsBought: integer("items_bought").default(0).notNull(),
  },
  (t) => [uniqueIndex("match_players_match_slot_idx").on(t.matchId, t.slot)]
);

export const matchEvents = pgTable("match_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .references(() => matches.id)
    .notNull(),
  timeS: doublePrecision("time_s").notNull(),
  eventType: text("event_type").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const rpcLogs = pgTable("rpc_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  method: text("method").notNull(),
  category: text("category"),
  status: integer("status"),
  url: text("url"),
  host: text("host"),
  req: jsonb("req"),
  res: jsonb("res"),
  extracted: jsonb("extracted"),
});
