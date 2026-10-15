import { useMemo, useSyncExternalStore } from "react";

let peekedId: string | null = null;
const listeners = new Set<() => void>();

export function subscribePeek(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return peekedId;
}

export function getPeekedId(): string | null {
  return peekedId;
}

export function setPeekedId(id: string | null): void {
  if (peekedId === id) return;
  peekedId = id;
  for (const listener of listeners) listener();
}

export type PeekApi = { peekedId: string | null; setPeek: (id: string | null) => void };

export function usePeek(): PeekApi {
  const current = useSyncExternalStore(subscribePeek, getSnapshot, getSnapshot);
  return useMemo(() => ({ peekedId: current, setPeek: setPeekedId }), [current]);
}
