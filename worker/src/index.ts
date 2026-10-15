import { ROOM_CODE_PATTERN, WS_PATH_PREFIX } from "@shared/protocol";
import { isAllowedOrigin } from "./origin";
import { ROOM_CODE_HEADER } from "./env";
import type { Env } from "./env";

export { RoomDO } from "./room";

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
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
