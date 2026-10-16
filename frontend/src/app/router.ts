import { useMemo, useSyncExternalStore } from "react";
import { ROOM_CODE_PATTERN } from "@shared/protocol";

export type Route = { name: "landing" } | { name: "room"; code: string } | { name: "sessions" } | { name: "notfound" };

export function parseRoute(hash: string): Route {
  const path = (hash.startsWith("#") ? hash.slice(1) : hash).replace(/\/+$/, "");
  if (path === "") return { name: "landing" };
  if (path === "/sessions") return { name: "sessions" };
  const match = /^\/r\/([^/]+)$/.exec(path);
  const code = match?.[1]?.toLowerCase();
  if (code !== undefined && ROOM_CODE_PATTERN.test(code)) return { name: "room", code };
  return { name: "notfound" };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHash(): string {
  return window.location.hash;
}

function getServerHash(): string {
  return "";
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  return useMemo(() => parseRoute(hash), [hash]);
}

export function navigate(path: string): void {
  const withLeadingSlash = path.startsWith("/") || path.startsWith("#") ? path : `/${path}`;
  const next = withLeadingSlash.startsWith("#") ? withLeadingSlash : `#${withLeadingSlash}`;
  if (window.location.hash !== next) window.location.hash = next;
}
