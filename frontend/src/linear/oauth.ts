import { LinearError } from "./client";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const SCOPE = "read,write";
const TOKEN_STORAGE_KEY = "pp.linearOAuth";
const PENDING_STORAGE_KEY = "pp.oauth.pending";
const ERROR_STORAGE_KEY = "pp.oauth.error";
const REFRESH_WINDOW_MS = 60_000;
const DEFAULT_RETURN_HASH = "#/";

const NOT_CONFIGURED_MESSAGE = "Linear sign-in is not configured";
const CANCELLED_MESSAGE = "Linear sign-in was cancelled.";
const FAILED_MESSAGE = "Linear sign-in failed. Try again.";
const EXPIRED_MESSAGE = "Linear sign-in expired. Try signing in again.";
const UNVERIFIED_MESSAGE = "Linear sign-in could not be verified. Try signing in again.";
const EXCHANGE_MESSAGE = "Could not finish signing in to Linear. Try again.";
const NETWORK_MESSAGE = "Could not reach Linear. Check your connection and try again.";
const REFRESH_FAILED_MESSAGE = "Could not refresh your Linear sign-in. Try again.";

export type OAuthTokens = { accessToken: string; refreshToken: string | null; expiresAt: number };

export type OAuthCompletion = { ok: true; returnHash: string } | { ok: false; error: string };

type PendingLogin = { verifier: string; state: string; returnHash: string };

type TokenPayload = { accessToken: string; refreshToken: string | null; expiresInMs: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

export function oauthClientId(): string | null {
  const configured: string | undefined = import.meta.env.VITE_LINEAR_CLIENT_ID;
  const trimmed = configured?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function oauthConfigured(): boolean {
  return oauthClientId() !== null;
}

export function oauthRedirectUri(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

function parseTokens(value: unknown): OAuthTokens | null {
  if (!isRecord(value)) return null;
  const { accessToken, refreshToken, expiresAt } = value;
  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (refreshToken !== null && typeof refreshToken !== "string") return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  return { accessToken, refreshToken, expiresAt };
}

export const oauthTokenStore = {
  get(): OAuthTokens | null {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      return parseTokens(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  set(tokens: OAuthTokens): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      return;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      return;
    }
  },
};

function parsePending(value: unknown): PendingLogin | null {
  if (!isRecord(value)) return null;
  const { verifier, state, returnHash } = value;
  if (typeof verifier !== "string" || typeof state !== "string" || typeof returnHash !== "string") return null;
  return { verifier, state, returnHash };
}

function readPending(): PendingLogin | null {
  const raw = readSession(PENDING_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return parsePending(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function startOAuthLogin(returnHash?: string): Promise<void> {
  const clientId = oauthClientId();
  if (clientId === null) throw new Error(NOT_CONFIGURED_MESSAGE);

  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const pending: PendingLogin = { verifier, state, returnHash: returnHash ?? DEFAULT_RETURN_HASH };
  writeSession(PENDING_STORAGE_KEY, JSON.stringify(pending));

  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: oauthRedirectUri(),
    state,
    codeChallenge: await pkceChallenge(verifier),
  });
  location.assign(url);
}

function readTokenPayload(value: unknown): TokenPayload | null {
  if (!isRecord(value)) return null;
  const { access_token, refresh_token, expires_in } = value;
  if (typeof access_token !== "string" || access_token === "") return null;
  const refreshToken = typeof refresh_token === "string" && refresh_token !== "" ? refresh_token : null;
  const expiresIn = typeof expires_in === "number" && Number.isFinite(expires_in) ? expires_in : 0;
  return { accessToken: access_token, refreshToken, expiresInMs: expiresIn * 1000 };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postTokenRequest(fetchImpl: typeof fetch, fields: Record<string, string>): Promise<Response> {
  return fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function fail(message: string): { ok: false; error: string } {
  writeSession(ERROR_STORAGE_KEY, message);
  return { ok: false, error: message };
}

export async function completeOAuthIfPresent(fetchImpl: typeof fetch = fetch): Promise<OAuthCompletion | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (code === null && error === null) return null;

  const state = params.get("state");
  const pending = readPending();
  removeSession(PENDING_STORAGE_KEY);
  const returnHash = pending?.returnHash ?? DEFAULT_RETURN_HASH;
  history.replaceState(null, "", location.pathname + returnHash);

  if (error !== null) return fail(error === "access_denied" ? CANCELLED_MESSAGE : FAILED_MESSAGE);
  if (pending === null) return fail(EXPIRED_MESSAGE);
  if (code === null || state === null || state !== pending.state) return fail(UNVERIFIED_MESSAGE);

  const clientId = oauthClientId();
  if (clientId === null) return fail(NOT_CONFIGURED_MESSAGE);

  let response: Response;
  try {
    response = await postTokenRequest(fetchImpl, {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: oauthRedirectUri(),
      code,
      code_verifier: pending.verifier,
    });
  } catch {
    return fail(EXCHANGE_MESSAGE);
  }

  const payload = response.ok ? readTokenPayload(await readJson(response)) : null;
  if (payload === null) return fail(EXCHANGE_MESSAGE);

  oauthTokenStore.set({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: Date.now() + payload.expiresInMs,
  });
  return { ok: true, returnHash: pending.returnHash };
}

export function takeOAuthError(): string | null {
  const message = readSession(ERROR_STORAGE_KEY);
  removeSession(ERROR_STORAGE_KEY);
  return message || null;
}

async function refreshStored(stored: OAuthTokens, fetchImpl: typeof fetch): Promise<string | null> {
  const clientId = oauthClientId();
  if (stored.refreshToken === null || clientId === null) {
    oauthTokenStore.clear();
    return null;
  }

  let response: Response;
  try {
    response = await postTokenRequest(fetchImpl, {
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      client_id: clientId,
    });
  } catch {
    throw new LinearError(NETWORK_MESSAGE);
  }

  if (response.status === 400 || response.status === 401) {
    oauthTokenStore.clear();
    return null;
  }

  const payload = response.ok ? readTokenPayload(await readJson(response)) : null;
  if (payload === null) throw new LinearError(REFRESH_FAILED_MESSAGE);

  const next: OAuthTokens = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? stored.refreshToken,
    expiresAt: Date.now() + payload.expiresInMs,
  };
  oauthTokenStore.set(next);
  return next.accessToken;
}

let refreshInFlight: Promise<string | null> | null = null;

export async function getAccessToken(fetchImpl: typeof fetch = fetch, force = false): Promise<string | null> {
  const stored = oauthTokenStore.get();
  if (stored === null) return null;
  if (!force && stored.expiresAt - Date.now() > REFRESH_WINDOW_MS) return stored.accessToken;

  if (refreshInFlight === null) {
    refreshInFlight = refreshStored(stored, fetchImpl).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function signOutOAuth(): void {
  oauthTokenStore.clear();
}
