import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/global.css";
import "./ui/ui.css";
import { completeOAuthIfPresent } from "./linear/oauth";

const OAUTH_TIMEOUT_MS = 8000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("OAuth callback timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => window.clearTimeout(timer));
}

async function bootstrap() {
  try {
    await withTimeout(completeOAuthIfPresent(), OAUTH_TIMEOUT_MS).catch(() => null);
  } catch {
    void 0;
  }

  const container = document.getElementById("root");
  if (!container) throw new Error("Missing #root element");

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
