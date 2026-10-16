import { SESSIONS_PATH } from "@shared/protocol";
import type { RoundPhase, SessionSummary, SessionsResponse } from "@shared/types";

const DEFAULT_BASE_URL = "http://localhost:8787";

export type SessionsErrorKind = "unauthorized" | "wrong_workspace" | "forbidden" | "unavailable";

export class SessionsError extends Error {
  readonly kind: SessionsErrorKind;

  constructor(kind: SessionsErrorKind) {
    super(kind);
    this.name = "SessionsError";
    this.kind = kind;
  }
}

const PHASES: readonly RoundPhase[] = ["idle", "voting", "revealed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPhase(value: unknown): value is RoundPhase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

function parseSession(value: unknown): SessionSummary | null {
  if (!isRecord(value)) return null;
  const { code, hostName, players, ticketsTotal, ticketsGroomed, phase, createdAt, lastActivityAt } = value;
  if (typeof code !== "string" || code === "") return null;
  if (typeof hostName !== "string") return null;
  if (!isCount(players) || !isCount(ticketsTotal) || !isCount(ticketsGroomed)) return null;
  if (!isPhase(phase)) return null;
  if (!isTimestamp(createdAt) || !isTimestamp(lastActivityAt)) return null;
  return { code, hostName, players, ticketsTotal, ticketsGroomed, phase, createdAt, lastActivityAt };
}

export function parseSessionsResponse(value: unknown): SessionSummary[] | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return null;
  const response: SessionsResponse = { sessions: [] };
  for (const entry of value.sessions) {
    const session = parseSession(entry);
    if (session !== null) response.sessions.push(session);
  }
  return response.sessions;
}

function sessionsBaseUrl(): string {
  const configured: string | undefined = import.meta.env.VITE_WS_BASE_URL;
  return (configured?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function forbiddenError(response: Response): Promise<SessionsError> {
  const body = await readJson(response);
  if (isRecord(body) && body.error === "wrong_workspace") return new SessionsError("wrong_workspace");
  return new SessionsError("forbidden");
}

export async function fetchSessions(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<SessionSummary[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${sessionsBaseUrl()}${SESSIONS_PATH}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SessionsError("unavailable");
  }

  if (response.status === 401) throw new SessionsError("unauthorized");
  if (response.status === 403) throw await forbiddenError(response);
  if (!response.ok) throw new SessionsError("unavailable");

  const sessions = parseSessionsResponse(await readJson(response));
  if (sessions === null) throw new SessionsError("unavailable");
  return sessions;
}
