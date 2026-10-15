import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createDemoService } from "../linear/demo";
import { createLiveService, createOAuthLiveService } from "../linear/live";
import { keyStore } from "../linear/keyStore";
import { oauthConfigured, oauthTokenStore, signOutOAuth, startOAuthLogin } from "../linear/oauth";
import type { LinearService } from "../linear/types";

export type LinearMode = "live" | "demo" | "none";
export type LinearAuthMethod = "oauth" | "key" | "demo" | null;

export type LinearContextValue = {
  service: LinearService | null;
  mode: LinearMode;
  authMethod: LinearAuthMethod;
  oauthAvailable: boolean;
  setKey: (key: string) => Promise<void>;
  clearKey: () => void;
  signIn: (returnHash?: string) => Promise<void>;
  signOut: () => void;
};

type LiveCredential = { method: "oauth" | "key"; service: LinearService };

const LinearContext = createContext<LinearContextValue | null>(null);

function resolveLiveCredential(): LiveCredential | null {
  if (oauthTokenStore.get() !== null) return { method: "oauth", service: createOAuthLiveService() };
  const key = keyStore.get();
  return key ? { method: "key", service: createLiveService(key) } : null;
}

export function LinearProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  const demoService = useMemo<LinearService | null>(() => (demo ? createDemoService() : null), [demo]);
  const [live, setLive] = useState<LiveCredential | null>(() => (demo ? null : resolveLiveCredential()));
  const oauthAvailable = useMemo(() => oauthConfigured(), []);

  const setKey = useCallback(async (key: string) => {
    const candidate = createLiveService(key);
    await candidate.getViewer();
    keyStore.set(key);
    oauthTokenStore.clear();
    setLive({ method: "key", service: candidate });
  }, []);

  const clearKey = useCallback(() => {
    keyStore.clear();
    setLive(resolveLiveCredential());
  }, []);

  const signIn = useCallback((returnHash?: string) => startOAuthLogin(returnHash ?? window.location.hash), []);

  const signOut = useCallback(() => {
    keyStore.clear();
    signOutOAuth();
    setLive(null);
  }, []);

  const value = useMemo<LinearContextValue>(() => {
    const service = demoService ?? live?.service ?? null;
    const mode: LinearMode = demoService ? "demo" : live ? "live" : "none";
    const authMethod: LinearAuthMethod = demoService ? "demo" : (live?.method ?? null);
    return { service, mode, authMethod, oauthAvailable, setKey, clearKey, signIn, signOut };
  }, [demoService, live, oauthAvailable, setKey, clearKey, signIn, signOut]);

  return <LinearContext.Provider value={value}>{children}</LinearContext.Provider>;
}

export function useLinear(): LinearContextValue {
  const value = useContext(LinearContext);
  if (!value) throw new Error("useLinear must be used inside LinearProvider");
  return value;
}
