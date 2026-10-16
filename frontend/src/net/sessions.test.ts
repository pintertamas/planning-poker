import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSIONS_PATH } from "@shared/protocol";
import type { SessionSummary } from "@shared/types";
import { fetchSessions, parseSessionsResponse, SessionsError } from "./sessions";

const TOKEN = "linear-token";

const validSession: SessionSummary = {
  code: "abc123",
  hostName: "Ann",
  players: 3,
  ticketsTotal: 8,
  ticketsGroomed: 2,
  phase: "voting",
  createdAt: 1_000,
  lastActivityAt: 2_000,
};

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: () => Response | Promise<Response>): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function expectKind(promise: Promise<unknown>, kind: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SessionsError);
  expect((error as SessionsError).kind).toBe(kind);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fetchSessions request", () => {
  it("GETs the sessions path on the default base with a bearer token", async () => {
    const { impl, calls } = fakeFetch(() => jsonResponse(200, { sessions: [] }));

    await fetchSessions(TOKEN, impl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://localhost:8787${SESSIONS_PATH}`);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("uses the configured base URL without a trailing slash", async () => {
    vi.stubEnv("VITE_WS_BASE_URL", "https://worker.example.test///");
    const { impl, calls } = fakeFetch(() => jsonResponse(200, { sessions: [] }));

    await fetchSessions(TOKEN, impl);

    expect(calls[0]?.url).toBe(`https://worker.example.test${SESSIONS_PATH}`);
  });
});

describe("fetchSessions outcomes", () => {
  it("returns the parsed sessions on success", async () => {
    const { impl } = fakeFetch(() => jsonResponse(200, { sessions: [validSession] }));

    await expect(fetchSessions(TOKEN, impl)).resolves.toEqual([validSession]);
  });

  it("drops malformed entries and keeps the valid ones", async () => {
    const malformed = [
      null,
      "abc123",
      { ...validSession, code: "" },
      { ...validSession, hostName: 4 },
      { ...validSession, players: 1.5 },
      { ...validSession, ticketsGroomed: -1 },
      { ...validSession, phase: "finished" },
      { ...validSession, createdAt: "yesterday" },
      { code: "abc123" },
    ];
    const { impl } = fakeFetch(() => jsonResponse(200, { sessions: [...malformed, validSession] }));

    await expect(fetchSessions(TOKEN, impl)).resolves.toEqual([validSession]);
  });

  it("treats a body without a sessions array as unavailable", async () => {
    const { impl } = fakeFetch(() => jsonResponse(200, { rooms: [] }));

    await expectKind(fetchSessions(TOKEN, impl), "unavailable");
  });

  it("treats a body that is not JSON as unavailable", async () => {
    const { impl } = fakeFetch(() => new Response("<html>", { status: 200 }));

    await expectKind(fetchSessions(TOKEN, impl), "unavailable");
  });

  it("maps 401 to unauthorized", async () => {
    const { impl } = fakeFetch(() => jsonResponse(401, { error: "unauthorized" }));

    await expectKind(fetchSessions(TOKEN, impl), "unauthorized");
  });

  it("maps 403 with wrong_workspace to wrong_workspace", async () => {
    const { impl } = fakeFetch(() => jsonResponse(403, { error: "wrong_workspace" }));

    await expectKind(fetchSessions(TOKEN, impl), "wrong_workspace");
  });

  it("maps any other 403 to forbidden", async () => {
    const { impl } = fakeFetch(() => jsonResponse(403, { error: "something_else" }));

    await expectKind(fetchSessions(TOKEN, impl), "forbidden");
  });

  it("maps a 403 with no readable body to forbidden", async () => {
    const { impl } = fakeFetch(() => new Response("nope", { status: 403 }));

    await expectKind(fetchSessions(TOKEN, impl), "forbidden");
  });

  it("maps 502 to unavailable", async () => {
    const { impl } = fakeFetch(() => jsonResponse(502, { error: "bad_gateway" }));

    await expectKind(fetchSessions(TOKEN, impl), "unavailable");
  });

  it("maps other server errors to unavailable", async () => {
    const { impl } = fakeFetch(() => jsonResponse(500, { error: "boom" }));

    await expectKind(fetchSessions(TOKEN, impl), "unavailable");
  });

  it("maps a network failure to unavailable", async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expectKind(fetchSessions(TOKEN, impl), "unavailable");
  });
});

describe("parseSessionsResponse", () => {
  it("returns null for non-object bodies", () => {
    expect(parseSessionsResponse(null)).toBeNull();
    expect(parseSessionsResponse([])).toBeNull();
    expect(parseSessionsResponse({ sessions: "none" })).toBeNull();
  });

  it("returns an empty list when there are no sessions", () => {
    expect(parseSessionsResponse({ sessions: [] })).toEqual([]);
  });
});
