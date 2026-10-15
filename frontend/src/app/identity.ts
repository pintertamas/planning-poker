type Kind = "local" | "session";

const ROOM_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ROOM_CODE_LENGTH = 6;
const UNBIASED_LIMIT = 252;

const memory: Record<Kind, Map<string, string>> = {
  local: new Map(),
  session: new Map(),
};

function safely<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function backing(kind: Kind): Storage | null {
  return safely(() => (kind === "local" ? window.localStorage : window.sessionStorage));
}

function read(kind: Kind, key: string): string | null {
  const stored = safely(() => backing(kind)?.getItem(key) ?? null);
  return stored ?? memory[kind].get(key) ?? null;
}

function write(kind: Kind, key: string, value: string): void {
  memory[kind].set(key, value);
  safely(() => backing(kind)?.setItem(key, value));
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = randomHex(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function getPlayerId(): string {
  const existing = read("local", "pp.playerId");
  if (existing) return existing;
  const id = randomId();
  write("local", "pp.playerId", id);
  return id;
}

export function getName(): string {
  return read("local", "pp.name") ?? "";
}

export function setName(name: string): void {
  write("local", "pp.name", name);
}

export function generateRoomCode(): string {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < UNBIASED_LIMIT && code.length < ROOM_CODE_LENGTH) {
        code += ROOM_ALPHABET.charAt(byte % ROOM_ALPHABET.length);
      }
    }
  }
  return code;
}

export function getHostSecret(code: string): string | null {
  return read("local", `pp.host.${code}`);
}

export function createHostSecret(code: string): string {
  const secret = randomHex(24);
  write("local", `pp.host.${code}`, secret);
  return secret;
}

export function markDemo(code: string): void {
  write("session", `pp.demo.${code}`, "1");
}

export function isDemo(code: string): boolean {
  return read("session", `pp.demo.${code}`) === "1";
}
