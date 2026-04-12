import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, matches, matchPlayers, matchEvents, rpcLogs } from "./schema";

export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);

export const selectMatchSchema = createSelectSchema(matches);
export const insertMatchSchema = createInsertSchema(matches);

export const selectMatchPlayerSchema = createSelectSchema(matchPlayers);
export const insertMatchPlayerSchema = createInsertSchema(matchPlayers);

export const selectMatchEventSchema = createSelectSchema(matchEvents);
export const insertMatchEventSchema = createInsertSchema(matchEvents);

export const selectRpcLogSchema = createSelectSchema(rpcLogs);
export const insertRpcLogSchema = createInsertSchema(rpcLogs);

export type User = z.infer<typeof selectUserSchema>;
export type Match = z.infer<typeof selectMatchSchema>;
export type MatchPlayer = z.infer<typeof selectMatchPlayerSchema>;
export type MatchEvent = z.infer<typeof selectMatchEventSchema>;
export type RpcLog = z.infer<typeof selectRpcLogSchema>;
