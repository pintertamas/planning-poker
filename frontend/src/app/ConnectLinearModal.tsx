import { useState } from "react";
import { Modal, PillButton } from "../ui";
import { useLinear } from "./linearContext";

export function ConnectLinearModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { oauthAvailable, signIn } = useLinear();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch {
      setError("Could not start sign-in with Linear. Try again.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign in with Linear to create a room">
      <div className="pp-form">
        <p>
          Rooms are created with your Linear account, so your company login (SSO) applies and the app reads and updates
          tickets as you. Your sign-in stays in this browser and is only shared with our server, briefly and without
          storing it, to confirm you belong to the company workspace when you open Live sessions. Teammates who join do
          not need to sign in.
        </p>
        {oauthAvailable ? (
          <PillButton
            variant="primary"
            size="lg"
            className="pp-connect-primary"
            onClick={handleSignIn}
            disabled={busy}
          >
            {busy && <span className="pp-spinner" aria-hidden="true" />}
            {busy ? "Opening Linear..." : "Sign in with Linear and create room"}
          </PillButton>
        ) : (
          <p className="pp-muted">Linear sign-in is not set up for this site yet.</p>
        )}
        {error && (
          <p role="alert" className="pp-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
