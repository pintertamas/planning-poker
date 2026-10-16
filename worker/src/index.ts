import { ROOM_CODE_PATTERN, SESSIONS_PATH, WS_PATH_PREFIX } from "@shared/protocol";
import { isAllowedOrigin } from "./origin";
import { ROOM_CODE_HEADER } from "./env";
import type { Env } from "./env";
import { directoryStub } from "./directory";
import { limitsFromEnv } from "./expiry";
import { verifyLinearTokenCached } from "./linearAuth";
import { LOCAL_HOSTNAMES, handleSessionsGet, handleSessionsPreflight, sessionsHeaders } from "./sessions";

export { RoomDO } from "./room";
export { Directory } from "./directory";

const sessionsResponse = async (request: Request, env: Env, url: URL): Promise<Response> => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    const outcome = handleSessionsPreflight({ origin, hostname: url.hostname }, env.ALLOWED_ORIGINS);
    return new Response(null, { status: outcome.status, headers: sessionsHeaders(outcome.corsOrigin) });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...sessionsHeaders(null), Allow: "GET, OPTIONS" },
    });
  }
  const outcome = await handleSessionsGet(
    { origin, hostname: url.hostname, authorization: request.headers.get("Authorization") },
    {
      allowedOrigins: env.ALLOWED_ORIGINS,
      allowedOrgKey: env.ALLOWED_LINEAR_ORG_KEY,
      maxAgeMs: limitsFromEnv(env).maxAgeMs,
      now: Date.now(),
      verify: (token) => verifyLinearTokenCached(token),
      list: (now, maxAgeMs) => directoryStub(env).list(now, maxAgeMs),
    },
  );
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: sessionsHeaders(outcome.corsOrigin),
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === SESSIONS_PATH) {
      return sessionsResponse(request, env, url);
    }
    if (!url.pathname.startsWith(WS_PATH_PREFIX)) {
      return new Response("Not found", { status: 404 });
    }
    const code = url.pathname.slice(WS_PATH_PREFIX.length);
    if (!ROOM_CODE_PATTERN.test(code)) {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const origin = request.headers.get("Origin");
    const originAllowed =
      origin === null
        ? LOCAL_HOSTNAMES.has(url.hostname)
        : isAllowedOrigin(origin, env.ALLOWED_ORIGINS);
    if (!originAllowed) {
      return new Response("Forbidden", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set(ROOM_CODE_HEADER, code);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(new Request(request, { headers }));
  },
};
