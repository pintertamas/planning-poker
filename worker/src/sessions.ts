import type { SessionSummary, SessionsResponse } from "@shared/types";
import { isAllowedOrigin } from "./origin";
import type { LinearVerification } from "./linearAuth";

export const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

const BEARER_PATTERN = /^Bearer\s+([A-Za-z0-9._~+\/=-]{1,512})$/i;

export type SessionsErrorBody = {
  error: "forbidden" | "unauthorized" | "linear_unreachable" | "wrong_workspace";
};

export type SessionsRequest = {
  origin: string | null;
  hostname: string;
  authorization: string | null;
};

export type SessionsDeps = {
  allowedOrigins: string;
  allowedOrgKey: string;
  maxAgeMs: number;
  now: number;
  verify: (token: string) => Promise<LinearVerification>;
  list: (now: number, maxAgeMs: number) => Promise<SessionSummary[]>;
};

export type SessionsOutcome = {
  status: number;
  body: SessionsResponse | SessionsErrorBody;
  corsOrigin: string | null;
};

export type PreflightOutcome = {
  status: 204 | 403;
  corsOrigin: string | null;
};

export const parseBearer = (header: string | null): string | null => {
  if (header === null) return null;
  const match = BEARER_PATTERN.exec(header.trim());
  return match?.[1] ?? null;
};

export const isCallerAllowed = (
  origin: string | null,
  hostname: string,
  allowedOrigins: string,
): boolean => (origin === null ? LOCAL_HOSTNAMES.has(hostname) : isAllowedOrigin(origin, allowedOrigins));

export const corsOriginFor = (origin: string | null, allowedOrigins: string): string | null =>
  origin !== null && isAllowedOrigin(origin, allowedOrigins) ? origin : null;

export const handleSessionsPreflight = (
  request: Pick<SessionsRequest, "origin" | "hostname">,
  allowedOrigins: string,
): PreflightOutcome => {
  const corsOrigin = corsOriginFor(request.origin, allowedOrigins);
  if (!isCallerAllowed(request.origin, request.hostname, allowedOrigins)) {
    return { status: 403, corsOrigin: null };
  }
  return { status: 204, corsOrigin };
};

export const handleSessionsGet = async (
  request: SessionsRequest,
  deps: SessionsDeps,
): Promise<SessionsOutcome> => {
  const corsOrigin = corsOriginFor(request.origin, deps.allowedOrigins);
  if (!isCallerAllowed(request.origin, request.hostname, deps.allowedOrigins)) {
    return { status: 403, body: { error: "forbidden" }, corsOrigin };
  }
  const token = parseBearer(request.authorization);
  if (token === null) {
    return { status: 401, body: { error: "unauthorized" }, corsOrigin };
  }
  const verification = await deps.verify(token);
  if (!verification.ok) {
    return verification.reason === "invalid"
      ? { status: 401, body: { error: "unauthorized" }, corsOrigin }
      : { status: 502, body: { error: "linear_unreachable" }, corsOrigin };
  }
  if (verification.orgKey.toLowerCase() !== deps.allowedOrgKey.toLowerCase()) {
    return { status: 403, body: { error: "wrong_workspace" }, corsOrigin };
  }
  const sessions = await deps.list(deps.now, deps.maxAgeMs);
  return { status: 200, body: { sessions }, corsOrigin };
};

export const sessionsHeaders = (corsOrigin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (corsOrigin !== null) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers["Access-Control-Allow-Headers"] = "authorization";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
};
