import { sha256Hex } from "./auth";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const VIEWER_QUERY = "query { viewer { id organization { urlKey } } }";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export type LinearVerification =
  | { ok: true; orgKey: string; userId: string }
  | { ok: false; reason: "invalid" | "unreachable" };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const INVALID: LinearVerification = { ok: false, reason: "invalid" };
const UNREACHABLE: LinearVerification = { ok: false, reason: "unreachable" };

const readViewer = (body: unknown): { orgKey: string; userId: string } | null => {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const viewer = body.data.viewer;
  if (!isRecord(viewer) || typeof viewer.id !== "string" || !isRecord(viewer.organization)) return null;
  const urlKey = viewer.organization.urlKey;
  if (typeof urlKey !== "string" || urlKey.length === 0) return null;
  return { orgKey: urlKey, userId: viewer.id };
};

export async function verifyLinearToken(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<LinearVerification> {
  let response: Response;
  try {
    response = await fetchImpl(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: VIEWER_QUERY }),
    });
  } catch {
    return UNREACHABLE;
  }
  if (response.status === 401 || response.status === 403) return INVALID;
  if (response.status >= 500 || response.status === 429) return UNREACHABLE;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return UNREACHABLE;
  }
  const viewer = readViewer(body);
  if (viewer === null) return INVALID;
  return { ok: true, ...viewer };
}

type CacheEntry = { expiresAt: number; result: Extract<LinearVerification, { ok: true }> };

const cache = new Map<string, CacheEntry>();

const cacheGet = (key: string, now: number): CacheEntry["result"] | null => {
  const entry = cache.get(key);
  if (entry === undefined) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.result;
};

const cacheSet = (key: string, result: CacheEntry["result"], now: number): void => {
  cache.delete(key);
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
};

export async function verifyLinearTokenCached(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<LinearVerification> {
  const key = await sha256Hex(token);
  const now = Date.now();
  const hit = cacheGet(key, now);
  if (hit !== null) return { ...hit };
  const result = await verifyLinearToken(token, fetchImpl);
  if (result.ok) cacheSet(key, result, Date.now());
  return result;
}
