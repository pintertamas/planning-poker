import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createDemoService } from "../linear/demo";
import { createLiveService } from "../linear/live";
import { keyStore } from "../linear/keyStore";
import type { LinearService } from "../linear/types";

export type LinearMode = "live" | "demo" | "none";

export type LinearContextValue = {
  service: LinearService | null;
  mode: LinearMode;
  setKey: (key: string) => Promise<void>;
  clearKey: () => void;
};

const LinearContext = createContext<LinearContextValue | null>(null);

export function LinearProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  const demoService = useMemo<LinearService | null>(() => (demo ? createDemoService() : null), [demo]);
  const [liveService, setLiveService] = useState<LinearService | null>(() => {
    if (demo) return null;
    const key = keyStore.get();
    return key ? createLiveService(key) : null;
  });

  const setKey = useCallback(async (key: string) => {
    const candidate = createLiveService(key);
    await candidate.getViewer();
    keyStore.set(key);
    setLiveService(candidate);
  }, []);

  const clearKey = useCallback(() => {
    keyStore.clear();
    setLiveService(null);
  }, []);

  const value = useMemo<LinearContextValue>(() => {
    const service = demoService ?? liveService;
    const mode: LinearMode = demoService ? "demo" : liveService ? "live" : "none";
    return { service, mode, setKey, clearKey };
  }, [demoService, liveService, setKey, clearKey]);

  return <LinearContext.Provider value={value}>{children}</LinearContext.Provider>;
}

export function useLinear(): LinearContextValue {
  const value = useContext(LinearContext);
  if (!value) throw new Error("useLinear must be used inside LinearProvider");
  return value;
}
