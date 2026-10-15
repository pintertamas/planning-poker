import { useState, type FormEvent } from "react";
import { Modal, PillButton } from "../ui";
import { useLinear } from "./linearContext";

const LINEAR_KEY_URL = "https://linear.app/settings/account/security";

export function ConnectLinearModal({
  open,
  onClose,
  connect,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  connect: (key: string) => Promise<void>;
  onConnected: () => void;
}) {
  const { oauthAvailable, signIn } = useLinear();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = key.trim();
    if (trimmed === "") {
      setError("Paste your Linear API key first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connect(trimmed);
      setKey("");
      onConnected();
    } catch {
      setError("Could not verify this key with Linear. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signIn();
    } catch {
      setSignInError("Could not start sign-in with Linear. Try again, or use a personal API key.");
      setSigningIn(false);
    }
  }

  const keyForm = (
    <form className="pp-form" onSubmit={handleSubmit}>
      <p>
        Create a personal API key in your Linear security settings and paste it here. The key is stored only in this
        browser and is never sent to our server.
      </p>
      <p>
        <a className="pp-link" href={LINEAR_KEY_URL} target="_blank" rel="noopener noreferrer">
          Open Linear security settings
        </a>
      </p>
      <label className="pp-field">
        <span className="pp-field-label">Personal API key</span>
        <input
          className="pp-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          aria-invalid={error !== null}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="pp-error">
          {error}
        </p>
      )}
      <div className="pp-modal-actions">
        <PillButton variant="ghost" onClick={onClose}>
          Cancel
        </PillButton>
        <PillButton type="submit" disabled={busy}>
          {busy ? "Checking..." : "Connect"}
        </PillButton>
      </div>
    </form>
  );

  return (
    <Modal open={open} onClose={onClose} title="Connect Linear">
      {oauthAvailable ? (
        <div className="pp-form">
          <p>
            Signing in lets Linear confirm it is you. Your tokens stay in this browser only and are never sent to our
            server.
          </p>
          <PillButton
            size="lg"
            className="pp-connect-primary"
            onClick={handleSignIn}
            disabled={signingIn || busy}
          >
            {signingIn && <span className="pp-spinner" aria-hidden="true" />}
            {signingIn ? "Opening Linear..." : "Sign in with Linear"}
          </PillButton>
          {signInError && (
            <p role="alert" className="pp-error">
              {signInError}
            </p>
          )}
          <div className="pp-divider">
            <span>or</span>
          </div>
          <details className="pp-disclosure">
            <summary>Use a personal API key instead</summary>
            {keyForm}
          </details>
        </div>
      ) : (
        keyForm
      )}
    </Modal>
  );
}
