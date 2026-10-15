import { describe, expect, it, vi } from "vitest";
import { createGraphqlClient, LinearAuthError, LinearError } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchReturning(response: Response) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response.clone());
}

function staticAuth(header: string | null = "Bearer at-test") {
  return { getHeader: vi.fn(async () => header) };
}

describe("createGraphqlClient", () => {
  it("sends the Bearer header from the provider to the GraphQL endpoint", async () => {
    const fetchMock = fetchReturning(jsonResponse({ data: { ok: true } }));
    const client = createGraphqlClient(staticAuth("Bearer at-1"), fetchMock as unknown as typeof fetch);

    await client.query("query { ok }");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.linear.app/graphql");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer at-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.method).toBe("POST");
  });

  it("returns data on success", async () => {
    const client = createGraphqlClient(
      staticAuth(),
      fetchReturning(jsonResponse({ data: { viewer: { id: "u1" } } })) as unknown as typeof fetch,
    );
    await expect(client.query<{ viewer: { id: string } }>("query { viewer { id } }")).resolves.toEqual({
      viewer: { id: "u1" },
    });
  });

  it("throws LinearError with the first message when an HTTP 200 body has errors", async () => {
    const client = createGraphqlClient(
      staticAuth(),
      fetchReturning(
        jsonResponse({
          data: null,
          errors: [{ message: "Field 'foo' doesn't exist" }, { message: "second" }],
        }),
      ) as unknown as typeof fetch,
    );

    const error = await client.query("query { foo }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearError);
    expect(error).not.toBeInstanceOf(LinearAuthError);
    expect((error as LinearError).message).toBe("Field 'foo' doesn't exist");
  });

  it("throws LinearAuthError on HTTP 401", async () => {
    const client = createGraphqlClient(staticAuth(), fetchReturning(jsonResponse({}, 401)) as unknown as typeof fetch);

    const error = await client.query("query { viewer { id } }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearAuthError);
    expect(error).toBeInstanceOf(LinearError);
  });

  it("throws LinearAuthError on HTTP 403", async () => {
    const client = createGraphqlClient(staticAuth(), fetchReturning(jsonResponse({}, 403)) as unknown as typeof fetch);
    await expect(client.query("query { viewer { id } }")).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("treats an authentication error extension in a 200 body as LinearAuthError", async () => {
    const client = createGraphqlClient(
      staticAuth(),
      fetchReturning(
        jsonResponse({
          data: null,
          errors: [{ message: "Authentication required", extensions: { type: "authentication error" } }],
        }),
      ) as unknown as typeof fetch,
    );
    await expect(client.query("query { viewer { id } }")).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("throws a friendly LinearError when the network request fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = createGraphqlClient(staticAuth(), fetchMock as unknown as typeof fetch);

    const error = await client.query("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearError);
    expect((error as LinearError).message).toMatch(/could not reach linear/i);
  });

  it("queryPartial returns data alongside errors instead of throwing", async () => {
    const client = createGraphqlClient(
      staticAuth(),
      fetchReturning(
        jsonResponse({
          data: { r0: { id: "a" }, r1: null },
          errors: [{ message: "Entity not found", path: ["r1"] }],
        }),
      ) as unknown as typeof fetch,
    );

    const result = await client.queryPartial<{ r0: { id: string } | null; r1: null }>("query { r0: issue(id: \"A-1\") { id } }");
    expect(result.data).toEqual({ r0: { id: "a" }, r1: null });
    expect(result.errors).toEqual([{ message: "Entity not found", path: ["r1"] }]);
  });
});

describe("createGraphqlClient refresh and sign-in handling", () => {
  function bearerAwareFetch(accepted: string) {
    return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const header = (init?.headers as Record<string, string>).Authorization;
      return header === accepted ? jsonResponse({ data: { ok: true } }) : jsonResponse({}, 401);
    });
  }

  it("refreshes once and retries the request when Linear returns 401", async () => {
    let header = "Bearer old";
    const provider = {
      getHeader: vi.fn(async () => header),
      refresh: vi.fn(async () => {
        header = "Bearer new";
        return true;
      }),
    };
    const fetchMock = bearerAwareFetch("Bearer new");
    const client = createGraphqlClient(provider, fetchMock as unknown as typeof fetch);

    await expect(client.query<{ ok: boolean }>("query { ok }")).resolves.toEqual({ ok: true });
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes and retries when the response carries an authentication error", async () => {
    let header = "Bearer old";
    const provider = {
      getHeader: vi.fn(async () => header),
      refresh: vi.fn(async () => {
        header = "Bearer new";
        return true;
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: null, errors: [{ message: "x", extensions: { type: "authentication error" } }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const client = createGraphqlClient(provider, fetchMock as unknown as typeof fetch);

    await expect(client.query<{ ok: boolean }>("query { ok }")).resolves.toEqual({ ok: true });
    expect(provider.refresh).toHaveBeenCalledTimes(1);
  });

  it("throws the sign-in expired error without retrying when refresh reports no new token", async () => {
    const provider = {
      getHeader: vi.fn(async () => "Bearer old"),
      refresh: vi.fn(async () => false),
    };
    const fetchMock = fetchReturning(jsonResponse({}, 401));
    const client = createGraphqlClient(provider, fetchMock as unknown as typeof fetch);

    const error = await client.query("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearAuthError);
    expect((error as LinearAuthError).message).toBe("Your Linear sign-in expired. Sign in again.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at most once even if the retried request is also rejected", async () => {
    const provider = {
      getHeader: vi.fn(async () => "Bearer old"),
      refresh: vi.fn(async () => true),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    const client = createGraphqlClient(provider, fetchMock as unknown as typeof fetch);

    await expect(client.query("query { ok }")).rejects.toBeInstanceOf(LinearAuthError);
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not refresh when the provider has no refresh method", async () => {
    const fetchMock = fetchReturning(jsonResponse({}, 401));
    const client = createGraphqlClient(
      { getHeader: async () => "Bearer old" },
      fetchMock as unknown as typeof fetch,
    );

    const error = await client.query("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearAuthError);
    expect((error as LinearAuthError).message).toBe("Your Linear sign-in expired. Sign in again.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws before calling Linear when getHeader returns null", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const client = createGraphqlClient({ getHeader: async () => null }, fetchMock as unknown as typeof fetch);

    const error = await client.query("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearAuthError);
    expect((error as LinearAuthError).message).toBe("Your Linear sign-in expired. Sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
