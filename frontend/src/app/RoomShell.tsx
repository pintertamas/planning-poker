import { RailNav, SidePanel, PillButton } from "../ui";
import { TicketPanel } from "../features/tickets/TicketPanel";
import { TicketStage } from "../features/tickets/TicketStage";
import { TableSection } from "../features/table/TableSection";
import { ResultsSection } from "../features/table/ResultsSection";
import { useRoomApi } from "../net/api";
import { useLinear } from "./linearContext";
import { navigate } from "./router";
import { RoomTopBar } from "./RoomTopBar";

export function RoomShell() {
  const { mode } = useLinear();
  const room = useRoomApi();

  return (
    <div className="pp-app">
      <RailNav
        items={[
          { id: "room", label: "Room", icon: "room", active: true, onClick: () => undefined },
          { id: "tickets", label: "Tickets", icon: "tickets", onClick: () => undefined },
          { id: "settings", label: "Settings", icon: "settings", onClick: () => undefined },
        ]}
        bottom={[{ id: "leave", label: "Leave", icon: "signout", onClick: () => navigate("/") }]}
      />
      <SidePanel title="Tickets">
        <TicketPanel />
      </SidePanel>
      <main className="pp-main">
        <RoomTopBar />
        {mode === "none" && room.me?.isHost && (
          <div className="pp-alert pp-alert--notice" role="status">
            <span className="pp-alert-text">
              Your Linear sign-in is no longer active, so tickets cannot be loaded or updated. Go back to the start and
              create a new room to sign in again.
            </span>
            <PillButton size="sm" onClick={() => navigate("/")}>
              Back to start
            </PillButton>
          </div>
        )}
        <TicketStage />
        <TableSection />
        <ResultsSection />
      </main>
    </div>
  );
}
