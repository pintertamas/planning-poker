import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSummary } from "@shared/types";
import { getAccessToken } from "../../linear/oauth";
import { fetchSessions, SessionsError, type SessionsErrorKind } from "../../net/sessions";
import {
  Chip,
  HeroCard,
  LogoMark,
  PillButton,
  RailNav,
  SectionCard,
  SidePanel,
  SideRow,
  TopBar,
} from "../../ui";
import { LinearProvider, useLinear } from "../linearContext";
import { navigate } from "../router";
import {
  groomedLabel,
  isFatalSessionsError,
  phaseChip,
  playersLabel,
  sessionsErrorMessage,
  startedLabel,
} from "./sessionsView";

const POLL_INTERVAL_MS = 10_000;

export function SessionsPage() {
  return (
    <LinearProvider demo={false}>
      <SessionsContent />
    </LinearProvider>
  );
}

function SessionsContent() {
  const { authMethod, signOut } = useLinear();
  const signedIn = authMethod === "oauth";
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<SessionsErrorKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const token = await getAccessToken();
      if (token === null) {
        setError("unauthorized");
        return;
      }
      const next = await fetchSessions(token);
      setSessions(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof SessionsError ? caught.kind : "unavailable");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const refreshIfVisible = () => {
      if (!document.hidden) void load();
    };
    refreshIfVisible();
    const timer = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [signedIn, load]);

  function handleSignOut() {
    signOut();
    navigate("/");
  }

  const fatal = error !== null && isFatalSessionsError(error);
  const loading = signedIn && sessions === null && error === null;
  const listed = signedIn && !fatal && sessions !== null ? sessions : null;

  return (
    <div className="pp-app">
      <RailNav
        items={[
          { id: "start", label: "Start", icon: "room", onClick: () => navigate("/") },
          { id: "sessions", label: "Sessions", icon: "users", active: true, onClick: () => navigate("/sessions") },
        ]}
        bottom={signedIn ? [{ id: "signout", label: "Sign out", icon: "signout", onClick: handleSignOut }] : undefined}
      />
      <SidePanel title="Live sessions">
        <SideRow>
          <span className="pp-side-icon">1</span>
          <span className="pp-side-label">Rooms people are in right now</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">2</span>
          <span className="pp-side-label">Pick one and enter your name</span>
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
        />
        {!signedIn && (
          <HeroCard
            title="Sign in to see live sessions."
            actions={
              <PillButton onClick={() => navigate("/")}>Back to start</PillButton>
            }
          >
            <p className="pp-hero-lede">
              Live sessions are only shown to people signed in with Linear. Sign in from Create room on the start page.
            </p>
          </HeroCard>
        )}
        {signedIn && (
          <>
            <HeroCard
              title="Live sessions."
              actions={
                <PillButton variant="ghost" icon="refresh" disabled={refreshing} onClick={() => void load()}>
                  Refresh
                </PillButton>
              }
            >
              <p className="pp-hero-lede">Rooms that are running right now. Join one and vote with your team.</p>
            </HeroCard>
            <SectionCard title="Running now">
              {loading && (
                <p className="pp-session-status pp-muted">
                  <span className="pp-spinner" aria-hidden="true" />
                  Loading live sessions...
                </p>
              )}
              {fatal && error !== null && (
                <div className="pp-alert pp-alert--notice" role="alert">
                  <span className="pp-alert-text">{sessionsErrorMessage(error)}</span>
                  {error === "unauthorized" && (
                    <PillButton size="sm" onClick={() => navigate("/")}>
                      Back to start
                    </PillButton>
                  )}
                </div>
              )}
              {error === "unavailable" && (
                <div className="pp-alert pp-alert--notice" role="alert">
                  <span className="pp-alert-text">{sessionsErrorMessage(error)}</span>
                  <PillButton size="sm" disabled={refreshing} onClick={() => void load()}>
                    Retry
                  </PillButton>
                </div>
              )}
              {listed !== null && listed.length === 0 && (
                <p className="pp-muted">No sessions are running right now. The list checks again every 10 seconds.</p>
              )}
              {listed !== null && listed.length > 0 && (
                <ul className="pp-session-list">
                  {listed.map((session) => (
                    <SessionRow key={session.code} session={session} now={Date.now()} />
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
}

function SessionRow({ session, now }: { session: SessionSummary; now: number }) {
  const phase = phaseChip(session.phase);
  const code = session.code.toUpperCase();
  return (
    <li className="pp-session-row">
      <div className="pp-session-main">
        <div className="pp-session-head">
          <span className="pp-session-code">{code}</span>
          <Chip tone={phase.tone}>{phase.label}</Chip>
        </div>
        <p className="pp-muted">Hosted by {session.hostName}</p>
        <div className="pp-session-meta">
          <Chip tone="teal">{playersLabel(session.players)}</Chip>
          <span>{groomedLabel(session.ticketsGroomed, session.ticketsTotal)}</span>
          <span>{startedLabel(now, session.createdAt)}</span>
        </div>
      </div>
      <PillButton
        size="md"
        icon="arrow-right"
        aria-label={`Join room ${code}`}
        onClick={() => navigate(`/r/${session.code.toLowerCase()}`)}
      >
        Join
      </PillButton>
    </li>
  );
}
