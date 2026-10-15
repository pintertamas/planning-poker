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

describe("createGraphqlClient", () => {
  it("sends the raw API key without a Bearer prefix", async () => {
    const fetchMock = fetchReturning(jsonResponse({ data: { ok: true } }));
    const client = createGraphqlClient("lin_api_test_key", fetchMock as unknown as typeof fetch);

    await client.query("query { ok }");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.linear.app/graphql");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("lin_api_test_key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.method).toBe("POST");
  });

  it("returns data on success", async () => {
    const client = createGraphqlClient(
      "k",
      fetchReturning(jsonResponse({ data: { viewer: { id: "u1" } } })) as unknown as typeof fetch,
    );
    await expect(client.query<{ viewer: { id: string } }>("query { viewer { id } }")).resolves.toEqual({
      viewer: { id: "u1" },
    });
  });

  it("throws LinearError with the first message when an HTTP 200 body has errors", async () => {
    const client = createGraphqlClient(
      "k",
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
    const client = createGraphqlClient("bad", fetchReturning(jsonResponse({}, 401)) as unknown as typeof fetch);

    const error = await client.query("query { viewer { id } }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearAuthError);
    expect(error).toBeInstanceOf(LinearError);
  });

  it("throws LinearAuthError on HTTP 403", async () => {
    const client = createGraphqlClient("bad", fetchReturning(jsonResponse({}, 403)) as unknown as typeof fetch);
    await expect(client.query("query { viewer { id } }")).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("treats an authentication error extension in a 200 body as LinearAuthError", async () => {
    const client = createGraphqlClient(
      "bad",
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
    const client = createGraphqlClient("k", fetchMock as unknown as typeof fetch);

    const error = await client.query("query { ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearError);
    expect((error as LinearError).message).toMatch(/could not reach linear/i);
  });

  it("queryPartial returns data alongside errors instead of throwing", async () => {
    const client = createGraphqlClient(
      "k",
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
