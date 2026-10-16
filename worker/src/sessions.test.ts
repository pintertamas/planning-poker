import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@shared/types";
import type { LinearVerification } from "./linearAuth";
import {
  corsOriginFor,
  handleSessionsGet,
  handleSessionsPreflight,
  parseBearer,
  sessionsHeaders,
} from "./sessions";
import type { SessionsDeps, SessionsRequest } from "./sessions";

const PROD = "https://pintertamas.github.io";
const ALLOWED = `${PROD}, https://other.example`;
const ORG = "marshmallow";
const NOW = 5_000_000;
const MAX_AGE = 4_200_000;
const TOKEN = "lin_api_good";

const SESSION: SessionSummary = {
  code: "abc123",
  hostName: "Alice",
  players: 2,
  ticketsTotal: 4,
  ticketsGroomed: 1,
  phase: "voting",
  createdAt: NOW - 1_000,
  lastActivityAt: NOW - 500,
};

const ok = (orgKey = ORG): LinearVerification => ({ ok: true, orgKey, userId: "user-1" });

const deps = (overrides: Partial<SessionsDeps> = {}): SessionsDeps => ({
  allowedOrigins: ALLOWED,
  allowedOrgKey: ORG,
  maxAgeMs: MAX_AGE,
  now: NOW,
  verify: vi.fn(async () => ok()),
  list: vi.fn(async () => [SESSION]),
  ...overrides,
});

const request = (overrides: Partial<SessionsRequest> = {}): SessionsRequest => ({
  origin: PROD,
  hostname: "planning-poker.example.workers.dev",
  authorization: `Bearer ${TOKEN}`,
  ...overrides,
});

describe("parseBearer", () => {
  it("extracts the token from a bearer header", () => {
    expect(parseBearer(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("accepts a lower-case scheme", () => {
    expect(parseBearer(`bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("returns null when the header is missing", () => {
    expect(parseBearer(null)).toBeNull();
  });

  it("returns null for another scheme", () => {
    expect(parseBearer(`Basic ${TOKEN}`)).toBeNull();
  });

  it("returns null for a bearer with no token", () => {
    expect(parseBearer("Bearer ")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
  });

  it("returns null when the token contains characters outside the allowed set", () => {
    expect(parseBearer("Bearer abc def")).toBeNull();
    expect(parseBearer("Bearer abc<script>")).toBeNull();
  });

  it("returns null for a token longer than 512 characters", () => {
    expect(parseBearer(`Bearer ${"a".repeat(513)}`)).toBeNull();
  });
});

describe("corsOriginFor", () => {
  it("echoes an allowed origin exactly", () => {
    expect(corsOriginFor(PROD, ALLOWED)).toBe(PROD);
  });

  it("returns null for a disallowed origin", () => {
    expect(corsOriginFor("https://evil.example", ALLOWED)).toBeNull();
  });

  it("returns null when there is no origin", () => {
    expect(corsOriginFor(null, ALLOWED)).toBeNull();
  });

  it("accepts a local development origin", () => {
    expect(corsOriginFor("http://localhost:5173", ALLOWED)).toBe("http://localhost:5173");
  });
});

describe("handleSessionsGet", () => {
  it("returns the sessions for a valid token from the right workspace", async () => {
    const d = deps();
    const outcome = await handleSessionsGet(request(), d);
    expect(outcome).toEqual({ status: 200, body: { sessions: [SESSION] }, corsOrigin: PROD });
    expect(d.verify).toHaveBeenCalledWith(TOKEN);
    expect(d.list).toHaveBeenCalledWith(NOW, MAX_AGE);
  });

  it("matches the workspace key case-insensitively", async () => {
    const outcome = await handleSessionsGet(
      request(),
      deps({ verify: async () => ok("Marshmallow") }),
    );
    expect(outcome.status).toBe(200);
  });

  it("returns an empty list when there are no live rooms", async () => {
    const outcome = await handleSessionsGet(request(), deps({ list: async () => [] }));
    expect(outcome).toEqual({ status: 200, body: { sessions: [] }, corsOrigin: PROD });
  });

  it("allows a missing origin only from localhost, without CORS headers", async () => {
    const outcome = await handleSessionsGet(
      request({ origin: null, hostname: "localhost" }),
      deps(),
    );
    expect(outcome).toEqual({ status: 200, body: { sessions: [SESSION] }, corsOrigin: null });
  });

  it("allows a missing origin from 127.0.0.1", async () => {
    const outcome = await handleSessionsGet(
      request({ origin: null, hostname: "127.0.0.1" }),
      deps(),
    );
    expect(outcome.status).toBe(200);
  });

  it("rejects a missing origin from a non-local host with 403 and no list", async () => {
    const d = deps();
    const outcome = await handleSessionsGet(
      request({ origin: null, hostname: "planning-poker.example.workers.dev" }),
      d,
    );
    expect(outcome).toEqual({ status: 403, body: { error: "forbidden" }, corsOrigin: null });
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.list).not.toHaveBeenCalled();
  });

  it("rejects a disallowed origin with 403 and no list", async () => {
    const d = deps();
    const outcome = await handleSessionsGet(request({ origin: "https://evil.example" }), d);
    expect(outcome).toEqual({ status: 403, body: { error: "forbidden" }, corsOrigin: null });
    expect(d.list).not.toHaveBeenCalled();
  });

  it("returns 401 unauthorized when the authorization header is missing", async () => {
    const d = deps();
    const outcome = await handleSessionsGet(request({ authorization: null }), d);
    expect(outcome).toEqual({ status: 401, body: { error: "unauthorized" }, corsOrigin: PROD });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("returns 401 unauthorized when the header is malformed", async () => {
    const d = deps();
    const outcome = await handleSessionsGet(request({ authorization: "Token abc" }), d);
    expect(outcome.status).toBe(401);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("returns 401 unauthorized when Linear rejects the token", async () => {
    const d = deps({ verify: async () => ({ ok: false, reason: "invalid" }) });
    const outcome = await handleSessionsGet(request(), d);
    expect(outcome).toEqual({ status: 401, body: { error: "unauthorized" }, corsOrigin: PROD });
    expect(d.list).not.toHaveBeenCalled();
  });

  it("returns 502 linear_unreachable when Linear cannot be reached", async () => {
    const d = deps({ verify: async () => ({ ok: false, reason: "unreachable" }) });
    const outcome = await handleSessionsGet(request(), d);
    expect(outcome).toEqual({
      status: 502,
      body: { error: "linear_unreachable" },
      corsOrigin: PROD,
    });
    expect(d.list).not.toHaveBeenCalled();
  });

  it("returns 403 wrong_workspace for a token from another Linear organization", async () => {
    const d = deps({ verify: async () => ok("otherco") });
    const outcome = await handleSessionsGet(request(), d);
    expect(outcome).toEqual({ status: 403, body: { error: "wrong_workspace" }, corsOrigin: PROD });
    expect(d.list).not.toHaveBeenCalled();
  });

  it("does not list sessions for a wrong-workspace token from a localhost caller", async () => {
    const d = deps({ verify: async () => ok("otherco") });
    const outcome = await handleSessionsGet(
      request({ origin: null, hostname: "localhost" }),
      d,
    );
    expect(outcome.status).toBe(403);
    expect(d.list).not.toHaveBeenCalled();
  });
});

describe("handleSessionsPreflight", () => {
  it("answers 204 with CORS for an allowed origin", () => {
    expect(handleSessionsPreflight({ origin: PROD, hostname: "h.example" }, ALLOWED)).toEqual({
      status: 204,
      corsOrigin: PROD,
    });
  });

  it("answers 403 without CORS for a disallowed origin", () => {
    expect(
      handleSessionsPreflight({ origin: "https://evil.example", hostname: "h.example" }, ALLOWED),
    ).toEqual({ status: 403, corsOrigin: null });
  });

  it("answers 403 for a missing origin from a non-local host", () => {
    expect(handleSessionsPreflight({ origin: null, hostname: "h.example" }, ALLOWED)).toEqual({
      status: 403,
      corsOrigin: null,
    });
  });

  it("answers 204 without CORS for a missing origin from localhost", () => {
    expect(handleSessionsPreflight({ origin: null, hostname: "localhost" }, ALLOWED)).toEqual({
      status: 204,
      corsOrigin: null,
    });
  });
});

describe("sessionsHeaders", () => {
  it("always sets no-store and Vary: Origin", () => {
    const headers = sessionsHeaders(null);
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers.Vary).toBe("Origin");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("adds the CORS headers for an allowed origin", () => {
    expect(sessionsHeaders(PROD)).toEqual({
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Origin": PROD,
      "Access-Control-Allow-Headers": "authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "600",
    });
  });
});
