import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createDemoService } from "../linear/demo";
import { createOAuthLiveService } from "../linear/live";
import { oauthConfigured, oauthTokenStore, signOutOAuth, startOAuthLogin } from "../linear/oauth";
import type { LinearService } from "../linear/types";

export type LinearMode = "live" | "demo" | "none";
export type LinearAuthMethod = "oauth" | "demo" | null;

export type LinearContextValue = {
  service: LinearService | null;
  mode: LinearMode;
  authMethod: LinearAuthMethod;
  oauthAvailable: boolean;
  signIn: (returnHash?: string) => Promise<void>;
  signOut: () => void;
};

const LinearContext = createContext<LinearContextValue | null>(null);

function resolveOAuthService(): LinearService | null {
  return oauthTokenStore.get() !== null ? createOAuthLiveService() : null;
}

export function LinearProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  const demoService = useMemo<LinearService | null>(() => (demo ? createDemoService() : null), [demo]);
  const [oauthService, setOauthService] = useState<LinearService | null>(() =>
    demo ? null : resolveOAuthService(),
  );
  const oauthAvailable = useMemo(() => oauthConfigured(), []);

  const signIn = useCallback((returnHash?: string) => startOAuthLogin(returnHash ?? window.location.hash), []);

  const signOut = useCallback(() => {
    signOutOAuth();
    setOauthService(null);
  }, []);

  const value = useMemo<LinearContextValue>(() => {
    const service = demoService ?? oauthService;
    const mode: LinearMode = demoService ? "demo" : oauthService ? "live" : "none";
    const authMethod: LinearAuthMethod = demoService ? "demo" : oauthService ? "oauth" : null;
    return { service, mode, authMethod, oauthAvailable, signIn, signOut };
  }, [demoService, oauthService, oauthAvailable, signIn, signOut]);

  return <LinearContext.Provider value={value}>{children}</LinearContext.Provider>;
}

export function useLinear(): LinearContextValue {
  const value = useContext(LinearContext);
  if (!value) throw new Error("useLinear must be used inside LinearProvider");
  return value;
}
