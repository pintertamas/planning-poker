import { WS_PATH_PREFIX } from "@shared/protocol";

const DEFAULT_BASE_URL = "http://localhost:8787";

export function wsUrl(code: string): string {
  const configured: string | undefined = import.meta.env.VITE_WS_BASE_URL;
  const base = (configured?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/^http/, "ws");
  return `${base}${WS_PATH_PREFIX}${code}`;
}
