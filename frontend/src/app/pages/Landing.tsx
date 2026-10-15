import { useRef, useState, type FormEvent } from "react";
import { ROOM_CODE_PATTERN } from "@shared/protocol";
import { createLiveService } from "../../linear/live";
import { keyStore } from "../../linear/keyStore";
import { Chip, HeroCard, Icon, LabelValue, LogoMark, PillButton, RailNav, SectionCard, SidePanel, SideRow, TopBar } from "../../ui";
import { ConnectLinearModal } from "../ConnectLinearModal";
import { createHostSecret, generateRoomCode, getName, markDemo, setName } from "../identity";
import { navigate } from "../router";

export function Landing() {
  const [name, setNameState] = useState(() => getName());
  const [connected, setConnected] = useState(() => keyStore.get() !== null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinRef = useRef<HTMLInputElement>(null);

  function openRoom(demo: boolean) {
    const code = generateRoomCode();
    createHostSecret(code);
    if (demo) markDemo(code);
    navigate(`/r/${code}`);
  }

  function handleCreate() {
    if (keyStore.get() === null) {
      setPendingCreate(true);
      setConnectOpen(true);
      return;
    }
    openRoom(false);
  }

  function handleConnected() {
    setConnectOpen(false);
    setConnected(true);
    if (pendingCreate) {
      setPendingCreate(false);
      openRoom(false);
    }
  }

  function closeConnect() {
    setConnectOpen(false);
    setPendingCreate(false);
  }

  async function connectWithKey(key: string) {
    await createLiveService(key).getViewer();
    keyStore.set(key);
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

  return (
    <div className="pp-app">
      <RailNav
        items={[
          { id: "start", label: "Start", icon: "room", active: true, onClick: () => navigate("/") },
          {
            id: "linear",
            label: "Linear",
            icon: "link",
            onClick: () => {
              setPendingCreate(false);
              setConnectOpen(true);
            },
          },
        ]}
      />
      <SidePanel title="Start" footer="Your Linear key stays in this browser.">
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
              <p className="pp-hero-note">Creating a room uses your personal Linear key, kept in this browser.</p>
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
        <SectionCard title="Your Linear key" collapsible defaultOpen={false}>
          <div className="pp-grid">
            <LabelValue label="Where it lives">This browser only</LabelValue>
            <LabelValue label="Our server">Never receives it</LabelValue>
            <LabelValue label="Demo rooms">Need no key</LabelValue>
          </div>
        </SectionCard>
      </main>
      <ConnectLinearModal
        open={connectOpen}
        onClose={closeConnect}
        connect={connectWithKey}
        onConnected={handleConnected}
      />
    </div>
  );
}
