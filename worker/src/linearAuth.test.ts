import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./linearAuth";
import { verifyLinearToken, verifyLinearTokenCached } from "./linearAuth";

const viewerBody = (urlKey = "marshmallow", id = "user-1") =>
  new Response(JSON.stringify({ data: { viewer: { id, organization: { urlKey } } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const mockFetch = (factory: () => Response | Promise<Response>) =>
  vi.fn<FetchLike>(async () => factory());

const rejecting = () => Promise.reject(new TypeError("fetch failed"));

describe("verifyLinearToken", () => {
  it("returns the org key and user id for a valid token", async () => {
    const fetchMock = mockFetch(() => viewerBody());
    expect(await verifyLinearToken("lin_api_good", fetchMock)).toEqual({
      ok: true,
      orgKey: "marshmallow",
      userId: "user-1",
    });
  });

  it("sends the token as a bearer header and the viewer query to Linear", async () => {
    const fetchMock = mockFetch(() => viewerBody());
    await verifyLinearToken("lin_api_good", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.linear.app/graphql");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer lin_api_good");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "query { viewer { id organization { urlKey } } }",
    });
  });

  it("reports invalid on HTTP 401", async () => {
    const fetchMock = mockFetch(() => new Response("nope", { status: 401 }));
    expect(await verifyLinearToken("bad", fetchMock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports invalid on HTTP 403", async () => {
    const fetchMock = mockFetch(() => new Response("nope", { status: 403 }));
    expect(await verifyLinearToken("bad", fetchMock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports invalid on a GraphQL authentication error", async () => {
    const fetchMock = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            errors: [{ message: "Authentication required", extensions: { type: "authentication" } }],
            data: null,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );
    expect(await verifyLinearToken("bad", fetchMock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports invalid when the viewer data is missing", async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    expect(await verifyLinearToken("odd", fetchMock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports invalid when the organization key is missing", async () => {
    const fetchMock = mockFetch(
      () =>
        new Response(JSON.stringify({ data: { viewer: { id: "u", organization: {} } } }), {
          status: 200,
        }),
    );
    expect(await verifyLinearToken("odd", fetchMock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports unreachable when fetch rejects", async () => {
    const fetchMock = mockFetch(rejecting);
    expect(await verifyLinearToken("any", fetchMock)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable on HTTP 500", async () => {
    const fetchMock = mockFetch(() => new Response("boom", { status: 500 }));
    expect(await verifyLinearToken("any", fetchMock)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable on HTTP 503", async () => {
    const fetchMock = mockFetch(() => new Response("busy", { status: 503 }));
    expect(await verifyLinearToken("any", fetchMock)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable on HTTP 429", async () => {
    const fetchMock = mockFetch(() => new Response("slow down", { status: 429 }));
    expect(await verifyLinearToken("any", fetchMock)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports unreachable when the body is not JSON", async () => {
    const fetchMock = mockFetch(() => new Response("<html>proxy</html>", { status: 200 }));
    expect(await verifyLinearToken("any", fetchMock)).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("verifyLinearTokenCached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the verified identity", async () => {
    const fetchMock = mockFetch(() => viewerBody("marshmallow", "cached-user-a"));
    expect(await verifyLinearTokenCached("cache-token-a", fetchMock)).toEqual({
      ok: true,
      orgKey: "marshmallow",
      userId: "cached-user-a",
    });
  });

  it("serves a repeat call from the cache without a second fetch", async () => {
    const fetchMock = mockFetch(() => viewerBody("marshmallow", "cached-user-b"));
    const first = await verifyLinearTokenCached("cache-token-b", fetchMock);
    const second = await verifyLinearTokenCached("cache-token-b", fetchMock);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches again once the five minute TTL has passed", async () => {
    const fetchMock = mockFetch(() => viewerBody("marshmallow", "cached-user-c"));
    await verifyLinearTokenCached("cache-token-c", fetchMock);
    vi.setSystemTime(1_000_000 + 5 * 60 * 1000 - 1);
    await verifyLinearTokenCached("cache-token-c", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + 5 * 60 * 1000);
    await verifyLinearTokenCached("cache-token-c", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache an invalid token", async () => {
    const fetchMock = mockFetch(() => new Response("nope", { status: 401 }));
    expect(await verifyLinearTokenCached("cache-token-d", fetchMock)).toEqual({
      ok: false,
      reason: "invalid",
    });
    await verifyLinearTokenCached("cache-token-d", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache an unreachable result", async () => {
    const fetchMock = mockFetch(rejecting);
    expect(await verifyLinearTokenCached("cache-token-e", fetchMock)).toEqual({
      ok: false,
      reason: "unreachable",
    });
    await verifyLinearTokenCached("cache-token-e", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps at most 200 entries, evicting the oldest first", async () => {
    const fetchMock = mockFetch(() => viewerBody());
    for (let i = 0; i < 200; i++) {
      await verifyLinearTokenCached(`cap-token-${i}`, fetchMock);
    }
    expect(fetchMock).toHaveBeenCalledTimes(200);
    await verifyLinearTokenCached("cap-token-199", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(200);
    await verifyLinearTokenCached("cap-token-overflow", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await verifyLinearTokenCached("cap-token-0", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(202);
  });
});
