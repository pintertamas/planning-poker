import { Chip, HeroCard, LogoMark, PillButton, RailNav, SidePanel, SideRow, TopBar } from "../../ui";
import { navigate } from "../router";

type SessionEndedScreenProps = {
  code: string;
  message: string;
};

export function SessionEndedScreen({ code, message }: SessionEndedScreenProps) {
  const label = `ROOM ${code.toUpperCase()}`;

  return (
    <div className="pp-app">
      <RailNav items={[{ id: "room", label: "Room", icon: "room", active: true, onClick: () => undefined }]} />
      <SidePanel title="What now?">
        <SideRow>
          <span className="pp-side-icon">1</span>
          <span className="pp-side-label">Ask your host for a new link</span>
        </SideRow>
        <SideRow>
          <span className="pp-side-icon">2</span>
          <span className="pp-side-label">Or start your own session from the start page</span>
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
              <Chip tone="outline">CLOSED</Chip>
            </>
          }
          title="This session has ended."
        >
          {message !== "This session has ended." && <p className="pp-hero-lede">{message}</p>}
          <div className="pp-join-actions">
            <PillButton size="lg" onClick={() => navigate("/")}>
              Back to start
            </PillButton>
          </div>
        </HeroCard>
      </main>
    </div>
  );
}
