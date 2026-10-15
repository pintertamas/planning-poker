const STORAGE_KEY = "pp.linearKey";

export const keyStore = {
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  },
  set(key: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      return;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
  },
};

export function maskKey(key: string): string {
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}
