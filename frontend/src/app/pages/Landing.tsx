import { useEffect, useRef, useState, type FormEvent } from "react";
import { ROOM_CODE_PATTERN } from "@shared/protocol";
import { takeOAuthError } from "../../linear/oauth";
import {
  Chip,
  HeroCard,
  Icon,
  LabelValue,
  LogoMark,
  PillButton,
  RailNav,
  SectionCard,
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
  const { mode, authMethod, oauthAvailable, setKey, signOut } = useLinear();
  const toast = useToast();
  const [name, setNameState] = useState(() => getName());
  const [connectOpen, setConnectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(() => readPendingCreate() && mode !== "none");
  const resumed = useRef(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinRef = useRef<HTMLInputElement>(null);

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
    if (mode === "none") {
      setPendingCreate(true);
      if (oauthAvailable) writePendingCreate(true);
      setConnectOpen(true);
      return;
    }
    openRoom(false);
  }

  function openConnect() {
    setPendingCreate(false);
    writePendingCreate(false);
    setConnectOpen(true);
  }

  function closeConnect() {
    setConnectOpen(false);
    setPendingCreate(false);
    writePendingCreate(false);
  }

  function handleConnected() {
    setConnectOpen(false);
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
  const statusLabel =
    authMethod === "oauth" ? "Signed in with Linear" : authMethod === "key" ? "Personal API key" : "Not connected";

  return (
    <div className="pp-app">
      <RailNav
        items={[
          { id: "start", label: "Start", icon: "room", active: true, onClick: () => navigate("/") },
          { id: "linear", label: "Linear", icon: "link", onClick: openConnect },
        ]}
      />
      <SidePanel title="Start" footer="Your Linear connection stays in this browser.">
        <SideRow active onClick={handleCreate}>
          <span className="pp-side-icon">
            <Icon name="plus" size={18} />
          </span>
          <span className="pp-side-label">Create room</span>
        </SideRow>
        <SideRow onClick={() => openRoom(true)}>
          <span className="pp-side-icon">
            <Icon name="play" size={16} />
          </span>
          <span className="pp-side-label">Try the demo</span>
        </SideRow>
        <SideRow onClick={() => joinRef.current?.focus()}>
          <span className="pp-side-icon">
            <Icon name="arrow-right" size={18} />
          </span>
          <span className="pp-side-label">Join with a code</span>
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
          right={
            connected ? <Chip tone="green">Linear connected</Chip> : <Chip tone="outline">No Linear key</Chip>
          }
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
          title="Estimate together, in your tickets."
          actions={
            <PillButton variant="secondary" onClick={() => openRoom(true)}>
              Try the demo
              <span className="pp-pill-chevron">
                <Icon name="arrow-right" size={14} />
              </span>
            </PillButton>
          }
        >
          <div className="pp-hero-form">
            <label className="pp-field">
              <span className="pp-field-label">Your name</span>
              <input
                className="pp-input"
                value={name}
                placeholder="Ada Lovelace"
                autoComplete="name"
                onChange={(event) => handleName(event.target.value)}
              />
            </label>
            <div className="pp-hero-create">
              <PillButton size="lg" icon="plus" onClick={handleCreate}>
                Create room
              </PillButton>
              <p className="pp-hero-note">Creating a room uses your Linear connection, kept in this browser.</p>
            </div>
            <form className="pp-hero-join" onSubmit={handleJoin}>
              <label className="pp-field">
                <span className="pp-field-label">Join with a code</span>
                <input
                  ref={joinRef}
                  className="pp-input"
                  value={joinCode}
                  placeholder="abc123"
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Room code"
                  aria-invalid={joinError !== null}
                  onChange={(event) => setJoinCode(event.target.value)}
                />
              </label>
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
        </HeroCard>
        <SectionCard title="How it works">
          <div className="pp-grid">
            <LabelValue label="Step 1">Create a room or join one with its code</LabelValue>
            <LabelValue label="Step 2">Share the link with your team</LabelValue>
            <LabelValue label="Step 3">Vote, reveal and accept an estimate</LabelValue>
          </div>
        </SectionCard>
        <SectionCard title="Linear connection" collapsible defaultOpen={false}>
          <div className="pp-grid">
            <LabelValue label="Status">{statusLabel}</LabelValue>
            <LabelValue label="Where it lives">This browser only</LabelValue>
            <LabelValue label="Our server">Never receives it</LabelValue>
            <LabelValue label="Demo rooms">Need no connection</LabelValue>
          </div>
          <div className="pp-hero-create">
            {connected ? (
              <PillButton variant="secondary" size="sm" onClick={signOut}>
                Disconnect
              </PillButton>
            ) : (
              <PillButton size="sm" icon="link" onClick={openConnect}>
                Connect
              </PillButton>
            )}
          </div>
        </SectionCard>
      </main>
      <ConnectLinearModal open={connectOpen} onClose={closeConnect} connect={setKey} onConnected={handleConnected} />
    </div>
  );
}
