import { useSyncExternalStore } from "react";

export type LinkedEntry = { identifier: string; url: string | null };

let stack: readonly LinkedEntry[] = [];
const listeners = new Set<() => void>();

function replace(next: readonly LinkedEntry[]): void {
  stack = next;
  for (const listener of listeners) listener();
}

export function subscribeLinkedStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLinkedStack(): readonly LinkedEntry[] {
  return stack;
}

export function openLinked(identifier: string, url: string | null = null): void {
  const key = identifier.toUpperCase();
  if (stack[stack.length - 1]?.identifier === key) return;
  replace([...stack, { identifier: key, url }]);
}

export function back(): void {
  if (stack.length < 2) return;
  replace(stack.slice(0, -1));
}

export function closeLinked(): void {
  if (stack.length === 0) return;
  replace([]);
}

export function useLinkedStack(): readonly LinkedEntry[] {
  return useSyncExternalStore(subscribeLinkedStack, getLinkedStack, getLinkedStack);
}
