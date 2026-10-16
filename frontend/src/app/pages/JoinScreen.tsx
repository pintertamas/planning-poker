import { useState, type FormEvent } from "react";
import { Chip, HeroCard, LogoMark, PillButton, RailNav, SidePanel, SideRow, TopBar } from "../../ui";
import { getName, setName } from "../identity";
import { navigate } from "../router";

type JoinScreenProps = {
  code: string;
  onJoin: (name: string) => void;
  initialName?: string;
  error?: string;
};

export function JoinScreen({ code, onJoin, initialName, error }: JoinScreenProps) {
  const [draft, setDraft] = useState(() => initialName ?? getName());
  const [errorDismissed, setErrorDismissed] = useState(false);
  const label = `ROOM ${code.toUpperCase()}`;
  const trimmed = draft.trim();
  const shownError = errorDismissed ? undefined : error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "") return;
    setName(trimmed);
    onJoin(trimmed);
  }

  return (
    <div className="pp-app">
      <RailNav items={[{ id: "room", label: "Room", icon: "room", active: true, onClick: () => undefined }]} />
      <SidePanel title="You are invited">
        <SideRow>
          <span className="pp-side-icon">1</span>
          <span className="pp-side-label">Pick the name your team will see</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">2</span>
          <span className="pp-side-label">Vote 1, 2, 3, 5 or 8 on each ticket</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">3</span>
          <span className="pp-side-label">Estimates are revealed together</span>
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
          right={<Chip tone="outline">{label}</Chip>}
        />
        <HeroCard
          chips={
            <>
              <Chip tone="dark">{label}</Chip>
              <Chip tone="outline">NO SIGN-IN NEEDED</Chip>
            </>
          }
          title="Join the grooming session."
        >
          <p className="pp-hero-lede">Your teammates are waiting. Pick a name and you are in.</p>
          <form className="pp-hero-form" onSubmit={handleSubmit}>
            <label className="pp-field">
              <span className="pp-field-label">YOUR NAME</span>
              <input
                className="pp-input"
                value={draft}
                placeholder="First name is fine"
                maxLength={24}
                autoComplete="name"
                autoFocus
                aria-invalid={shownError ? true : undefined}
                aria-describedby={shownError ? "join-name-error" : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setErrorDismissed(true);
                }}
              />
            </label>
            {shownError && (
              <p id="join-name-error" role="alert" className="pp-error">
                {shownError}
              </p>
            )}
            <div className="pp-join-actions">
              <PillButton type="submit" size="lg" disabled={trimmed === ""}>
                Join room
              </PillButton>
              <PillButton variant="ghost" onClick={() => navigate("/")}>
                Back to start
              </PillButton>
            </div>
          </form>
        </HeroCard>
      </main>
    </div>
  );
}
