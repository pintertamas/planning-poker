import { DurableObject } from "cloudflare:workers";
import type { SessionSummary } from "@shared/types";
import type { Env } from "./env";

export const DIRECTORY_NAME = "all";
const MAX_LISTED = 50;

type SummaryRow = { summary: string };

export const directoryStub = (env: Env): DurableObjectStub<Directory> =>
  env.DIRECTORY.get(env.DIRECTORY.idFromName(DIRECTORY_NAME));

export class Directory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (code TEXT PRIMARY KEY, players INTEGER NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, summary TEXT NOT NULL)",
    );
  }

  async upsert(summary: SessionSummary): Promise<void> {
    this.ctx.storage.sql.exec(
      "INSERT INTO sessions (code, players, created_at, last_activity_at, summary) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET players = excluded.players, created_at = excluded.created_at, last_activity_at = excluded.last_activity_at, summary = excluded.summary",
      summary.code,
      summary.players,
      summary.createdAt,
      summary.lastActivityAt,
      JSON.stringify(summary),
    );
  }

  async remove(code: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE code = ?", code);
  }

  async list(now: number, maxAgeMs: number): Promise<SessionSummary[]> {
    this.ctx.storage.sql.exec(
      "DELETE FROM sessions WHERE players <= 0 OR created_at + ? <= ?",
      maxAgeMs,
      now,
    );
    const rows = this.ctx.storage.sql
      .exec<SummaryRow>(
        "SELECT summary FROM sessions WHERE players > 0 AND created_at + ? > ? ORDER BY last_activity_at DESC LIMIT ?",
        maxAgeMs,
        now,
        MAX_LISTED,
      )
      .toArray();
    return rows.map((row) => JSON.parse(row.summary) as SessionSummary);
  }
}
