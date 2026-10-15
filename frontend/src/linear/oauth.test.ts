import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinearError } from "./client";
import {
  buildAuthorizeUrl,
  completeOAuthIfPresent,
  getAccessToken,
  oauthClientId,
  oauthConfigured,
  oauthRedirectUri,
  oauthTokenStore,
  pkceChallenge,
  signOutOAuth,
  startOAuthLogin,
  takeOAuthError,
} from "./oauth";

const TOKEN_KEY = "pp.linearOAuth";
const PENDING_KEY = "pp.oauth.pending";
const NOW = 1_000_000;

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException("denied", "SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

function stubLocation(search: string) {
  const location = {
    origin: "https://pintertamas.github.io",
    pathname: "/planning-poker/",
    search,
    assign: vi.fn(),
  };
  const replaceState = vi.fn();
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", { replaceState });
  return { location, replaceState };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fetchReturning(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
}

function formBody(fetchMock: { mock: { calls: unknown[][] } }, index = 0): URLSearchParams {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return new URLSearchParams(String(init?.body));
}

function seedTokens(tokens: { accessToken: string; refreshToken: string | null; expiresAt: number }) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function storedTokens() {
  return JSON.parse(String(localStorage.getItem(TOKEN_KEY))) as { accessToken: string; refreshToken: string | null; expiresAt: number };
}

describe("PKCE and authorize URL", () => {
  it("derives the S256 challenge from the RFC 7636 test vector", async () => {
    await expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("builds the authorize URL with the code flow parameters", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-123",
        redirectUri: "https://pintertamas.github.io/planning-poker/",
        state: "state-abc",
        codeChallenge: "challenge-xyz",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe("https://linear.app/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-123",
      redirect_uri: "https://pintertamas.github.io/planning-poker/",
      response_type: "code",
      scope: "read,write",
      state: "state-abc",
      code_challenge: "challenge-xyz",
      code_challenge_method: "S256",
    });
  });
});

describe("configuration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads and trims the client id from the environment", () => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "  client-123  ");
    expect(oauthClientId()).toBe("client-123");
    expect(oauthConfigured()).toBe(true);
  });

  it("treats an empty client id as not configured", () => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "   ");
    expect(oauthClientId()).toBeNull();
    expect(oauthConfigured()).toBe(false);
  });

  it("builds the redirect URI from the origin and the base path", () => {
    stubLocation("");
    expect(oauthRedirectUri()).toBe(`https://pintertamas.github.io${import.meta.env.BASE_URL}`);
  });
});

describe("startOAuthLogin", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "client-123");
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores a pending verifier and state, then redirects with the S256 challenge", async () => {
    const first = stubLocation("");
    await startOAuthLogin("#/r/ROOM1");

    const assigned = new URL(String(first.location.assign.mock.calls[0]?.[0]));
    expect(`${assigned.origin}${assigned.pathname}`).toBe("https://linear.app/oauth/authorize");
    expect(assigned.searchParams.get("client_id")).toBe("client-123");
    expect(assigned.searchParams.get("code_challenge_method")).toBe("S256");

    const pending = JSON.parse(String(sessionStorage.getItem(PENDING_KEY))) as {
      verifier: string;
      state: string;
      returnHash: string;
    };
    expect(pending.state).toBe(assigned.searchParams.get("state"));
    expect(pending.returnHash).toBe("#/r/ROOM1");
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);
    expect(assigned.searchParams.get("code_challenge")).toBe(await pkceChallenge(pending.verifier));
  });

  it("defaults the return hash to the home route", async () => {
    stubLocation("");
    await startOAuthLogin();
    expect(JSON.parse(String(sessionStorage.getItem(PENDING_KEY))).returnHash).toBe("#/");
  });

  it("throws when no client id is configured", async () => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "");
    stubLocation("");
    await expect(startOAuthLogin()).rejects.toThrow("Linear sign-in is not configured");
  });
});

describe("completeOAuthIfPresent", () => {
  let session: Storage;

  beforeEach(() => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "client-123");
    session = memoryStorage();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", session);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function beginLogin(): Promise<{ state: string }> {
    const first = stubLocation("");
    await startOAuthLogin("#/r/ROOM1");
    const assigned = new URL(String(first.location.assign.mock.calls[0]?.[0]));
    return { state: assigned.searchParams.get("state") ?? "" };
  }

  it("returns null when the URL has no code or error", async () => {
    stubLocation("");
    const fetchMock = fetchReturning();
    await expect(completeOAuthIfPresent(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code with the verifier, stores tokens and cleans the URL", async () => {
    const { state } = await beginLogin();
    const verifier = (JSON.parse(String(session.getItem(PENDING_KEY))) as { verifier: string }).verifier;
    const callback = stubLocation(`?code=the-code&state=${state}`);
    const fetchMock = fetchReturning(
      jsonResponse({ access_token: "at-1", refresh_token: "rt-1", expires_in: 86399, token_type: "Bearer" }),
    );

    const result = await completeOAuthIfPresent(fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, returnHash: "#/r/ROOM1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.linear.app/oauth/token");
    const body = formBody(fetchMock);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("client-123");
    expect(body.get("redirect_uri")).toBe("https://pintertamas.github.io/");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe(verifier);
    expect(body.has("client_secret")).toBe(false);
    expect(storedTokens()).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: NOW + 86399 * 1000,
    });
    expect(session.getItem(PENDING_KEY)).toBeNull();
    expect(callback.replaceState).toHaveBeenCalledWith(null, "", "/planning-poker/#/r/ROOM1");
  });

  it("rejects a state that does not match and cleans the URL without calling Linear", async () => {
    await beginLogin();
    const callback = stubLocation("?code=the-code&state=forged");
    const fetchMock = fetchReturning();

    const result = await completeOAuthIfPresent(fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: "Linear sign-in could not be verified. Try signing in again." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(callback.replaceState).toHaveBeenCalledWith(null, "", "/planning-poker/#/r/ROOM1");
    expect(takeOAuthError()).toBe("Linear sign-in could not be verified. Try signing in again.");
  });

  it("rejects a callback with no pending record", async () => {
    stubLocation("?code=the-code&state=anything");
    const fetchMock = fetchReturning();
    const result = await completeOAuthIfPresent(fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, error: "Linear sign-in expired. Try signing in again." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a denied consent screen and cleans the URL", async () => {
    const { state } = await beginLogin();
    const callback = stubLocation(`?error=access_denied&state=${state}`);
    const fetchMock = fetchReturning();

    const result = await completeOAuthIfPresent(fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: "Linear sign-in was cancelled." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callback.replaceState).toHaveBeenCalledWith(null, "", "/planning-poker/#/r/ROOM1");
  });

  it("reports a failed token exchange without storing tokens", async () => {
    const { state } = await beginLogin();
    stubLocation(`?code=bad&state=${state}`);
    const fetchMock = fetchReturning(jsonResponse({ error: "invalid_grant" }, 400));

    const result = await completeOAuthIfPresent(fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: "Could not finish signing in to Linear. Try again." });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("takeOAuthError", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the saved message once and then clears it", () => {
    sessionStorage.setItem("pp.oauth.error", "Linear sign-in failed. Try again.");
    expect(takeOAuthError()).toBe("Linear sign-in failed. Try again.");
    expect(takeOAuthError()).toBeNull();
  });
});

describe("oauthTokenStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips tokens and clears them", () => {
    oauthTokenStore.set({ accessToken: "at", refreshToken: "rt", expiresAt: 5 });
    expect(oauthTokenStore.get()).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 5 });
    oauthTokenStore.clear();
    expect(oauthTokenStore.get()).toBeNull();
  });

  it("returns null for malformed stored values", () => {
    localStorage.setItem(TOKEN_KEY, "not json");
    expect(oauthTokenStore.get()).toBeNull();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: "", refreshToken: null, expiresAt: 1 }));
    expect(oauthTokenStore.get()).toBeNull();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: "at", refreshToken: 7, expiresAt: 1 }));
    expect(oauthTokenStore.get()).toBeNull();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: "at", refreshToken: null, expiresAt: "soon" }));
    expect(oauthTokenStore.get()).toBeNull();
  });

  it("does not throw when storage access throws", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    expect(() => oauthTokenStore.set({ accessToken: "at", refreshToken: null, expiresAt: 1 })).not.toThrow();
    expect(oauthTokenStore.get()).toBeNull();
    expect(() => oauthTokenStore.clear()).not.toThrow();
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "client-123");
    vi.stubGlobal("localStorage", memoryStorage());
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null when nothing is stored", async () => {
    const fetchMock = fetchReturning();
    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the stored token without refreshing while it is valid", async () => {
    seedTokens({ accessToken: "at", refreshToken: "rt", expiresAt: NOW + 3_600_000 });
    const fetchMock = fetchReturning();
    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBe("at");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when the token expires within 60 seconds and stores the rotated refresh token", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW + 30_000 });
    const fetchMock = fetchReturning(
      jsonResponse({ access_token: "new", refresh_token: "rt-2", expires_in: 86399 }),
    );

    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBe("new");

    const body = formBody(fetchMock);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-1");
    expect(body.get("client_id")).toBe("client-123");
    expect([...body.keys()].sort()).toEqual(["client_id", "grant_type", "refresh_token"]);
    expect(storedTokens()).toEqual({ accessToken: "new", refreshToken: "rt-2", expiresAt: NOW + 86399 * 1000 });
  });

  it("refreshes when forced even though the token is still valid", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW + 3_600_000 });
    const fetchMock = fetchReturning(jsonResponse({ access_token: "new", refresh_token: "rt-2", expires_in: 60 }));

    await expect(getAccessToken(fetchMock as unknown as typeof fetch, true)).resolves.toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW - 1 });
    const fetchMock = fetchReturning(jsonResponse({ access_token: "new", refresh_token: "rt-2", expires_in: 60 }));

    const tokens = await Promise.all([
      getAccessToken(fetchMock as unknown as typeof fetch),
      getAccessToken(fetchMock as unknown as typeof fetch),
      getAccessToken(fetchMock as unknown as typeof fetch, true),
    ]);

    expect(tokens).toEqual(["new", "new", "new"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the tokens and returns null when Linear rejects the refresh token", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW - 1 });
    const fetchMock = fetchReturning(jsonResponse({ error: "invalid_grant" }, 400));

    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("clears the tokens on HTTP 401 from the refresh endpoint", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW - 1 });
    const fetchMock = fetchReturning(jsonResponse({}, 401));

    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("clears expired tokens that have no refresh token without calling Linear", async () => {
    seedTokens({ accessToken: "old", refreshToken: null, expiresAt: NOW - 1 });
    const fetchMock = fetchReturning();

    await expect(getAccessToken(fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("throws a LinearError on a network failure and keeps the stored tokens", async () => {
    seedTokens({ accessToken: "old", refreshToken: "rt-1", expiresAt: NOW - 1 });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await getAccessToken(fetchMock as unknown as typeof fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearError);
    expect((error as LinearError).message).toMatch(/could not reach linear/i);
    expect(storedTokens().refreshToken).toBe("rt-1");
  });
});

describe("signOutOAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the stored OAuth tokens", () => {
    oauthTokenStore.set({ accessToken: "at", refreshToken: "rt", expiresAt: 1 });
    signOutOAuth();
    expect(oauthTokenStore.get()).toBeNull();
  });
});
