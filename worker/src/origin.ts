import { LOCAL_ORIGIN_PATTERN } from "@shared/protocol";

export function isAllowedOrigin(origin: string | null, allowedCsv: string): boolean {
  if (origin === null) return false;
  if (LOCAL_ORIGIN_PATTERN.test(origin)) return true;
  return allowedCsv
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(origin);
}
