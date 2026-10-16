import { useEffect, useRef, useState, type FormEvent } from "react";
import { ROOM_CODE_PATTERN } from "@shared/protocol";
import { takeOAuthError } from "../../linear/oauth";
import {
  Chip,
  HeroCard,
  Icon,
  LogoMark,
  PillButton,
  RailNav,
  SidePanel,
  SideRow,
  TopBar,
  useToast,
} from "../../ui";
import { ConnectLinearModal } from "../ConnectLinearModal";
import { createHostSecret, generateRoomCode, getName, markDemo, setName } from "../identity";
import { LinearProvider, useLinear } from "../linearContext";
import { navigate } from "../router";

const PENDING_CREATE_KEY = "pp.pendingCreate";

function readPendingCreate(): boolean {
  try {
    return sessionStorage.getItem(PENDING_CREATE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePendingCreate(pending: boolean): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_CREATE_KEY, "1");
    else sessionStorage.removeItem(PENDING_CREATE_KEY);
  } catch {
    return;
  }
}

export function Landing() {
  return (
    <LinearProvider demo={false}>
      <LandingContent />
    </LinearProvider>
  );
}

function LandingContent() {
  const { mode, oauthAvailable, signOut } = useLinear();
  const toast = useToast();
  const [name, setNameState] = useState(() => getName());
  const [connectOpen, setConnectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(() => readPendingCreate() && mode !== "none");
  const resumed = useRef(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    writePendingCreate(false);
  }, []);

  useEffect(() => {
    const message = takeOAuthError();
    if (message) toast(message, "error");
  }, [toast]);

  useEffect(() => {
    if (!pendingCreate || mode === "none" || resumed.current) return;
    resumed.current = true;
    setPendingCreate(false);
    openRoom(false);
  }, [pendingCreate, mode]);

  function openRoom(demo: boolean) {
    const code = generateRoomCode();
    createHostSecret(code);
    if (demo) markDemo(code);
    navigate(`/r/${code}`);
  }

  function handleCreate() {
    if (mode !== "none") {
      openRoom(false);
      return;
    }
    if (oauthAvailable) {
      setPendingCreate(true);
      writePendingCreate(true);
    }
    setConnectOpen(true);
  }

  function closeConnect() {
    setConnectOpen(false);
    setPendingCreate(false);
    writePendingCreate(false);
  }

  function handleName(value: string) {
    setNameState(value);
    setName(value);
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!ROOM_CODE_PATTERN.test(code)) {
      setJoinError("Room codes are six letters or numbers.");
      return;
    }
    setJoinError(null);
    navigate(`/r/${code}`);
  }

  const connected = mode !== "none";

  return (
    <div className="pp-app">
      <RailNav
        items={[{ id: "start", label: "Start", icon: "room", active: true, onClick: () => navigate("/") }]}
        bottom={
          connected ? [{ id: "signout", label: "Sign out", icon: "signout", onClick: signOut }] : undefined
        }
      />
      <SidePanel title="How it works">
        <SideRow>
          <span className="pp-side-icon">1</span>
          <span className="pp-side-label">Create a room, sign in with Linear, import tickets</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">2</span>
          <span className="pp-side-label">Share the link with your team</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">3</span>
          <span className="pp-side-label">Vote, reveal, accept the estimate</span>
        </SideRow>
      </SidePanel>
      <main className="pp-main">
        <TopBar
          left={
            <span className="pp-brand">
              <LogoMark size={32} />
              Pointing Poker
            </span>
          }
          center={<span className="pp-muted">Planning poker for Linear tickets</span>}
        />
        <HeroCard
          chips={
            <>
              <Chip tone="green">Linear</Chip>
              <Chip tone="blue">Live votes</Chip>
              <Chip tone="outline">No sign-up</Chip>
              <Chip tone="teal">Demo ready</Chip>
            </>
          }
          title="Groom the backlog."
          actions={
            <PillButton variant="secondary" onClick={() => openRoom(true)}>
              Try the demo
              <span className="pp-pill-chevron">
                <Icon name="arrow-right" size={14} />
              </span>
            </PillButton>
          }
        >
          <p className="pp-hero-lede">
            Pick tickets from Linear, vote 1, 2, 3, 5 or 8, and the estimate goes back to the ticket.
          </p>
          <div className="pp-hero-form">
            <label className="pp-field pp-hero-name">
              <span className="pp-field-label">Your name</span>
              <input
                className="pp-input"
                value={name}
                placeholder="First name is fine"
                autoComplete="name"
                onChange={(event) => handleName(event.target.value)}
              />
            </label>
            <div className="pp-hero-grid">
              <div className="pp-hero-block">
                <span className="pp-field-label">Start a session</span>
                <PillButton size="lg" icon="plus" onClick={handleCreate} disabled={!oauthAvailable && mode === "none"}>
                  Create room
                </PillButton>
                {connected && (
                  <p className="pp-hero-status pp-hero-status--ok">
                    <Icon name="check" size={16} />
                    Signed in with Linear
                  </p>
                )}
                {!connected && oauthAvailable && (
                  <p className="pp-hero-status pp-muted">
                    You will sign in with Linear first. Your teammates only need the link.
                  </p>
                )}
                {!connected && !oauthAvailable && (
                  <p className="pp-hero-status pp-muted">Linear sign-in is not set up yet. You can still try the demo.</p>
                )}
              </div>
              <div className="pp-hero-block pp-hero-block--join">
                <span className="pp-field-label">Join with a code</span>
                <form className="pp-hero-join" onSubmit={handleJoin}>
                  <input
                    className="pp-input pp-hero-code"
                    value={joinCode}
                    placeholder="ABC123"
                    maxLength={6}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-label="Room code"
                    aria-invalid={joinError !== null}
                    onChange={(event) => setJoinCode(event.target.value)}
                  />
                  <PillButton type="submit" variant="ghost" size="lg" icon="arrow-right">
                    Join
                  </PillButton>
                </form>
                {joinError && (
                  <p role="alert" className="pp-error">
                    {joinError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </HeroCard>
      </main>
      <ConnectLinearModal open={connectOpen} onClose={closeConnect} />
    </div>
  );
}
