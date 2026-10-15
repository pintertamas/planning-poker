import { useState } from "react";
import { RailNav, SidePanel, PillButton } from "../ui";
import { TicketPanel } from "../features/tickets/TicketPanel";
import { TicketStage } from "../features/tickets/TicketStage";
import { TableSection } from "../features/table/TableSection";
import { ResultsSection } from "../features/table/ResultsSection";
import { ConnectLinearModal } from "./ConnectLinearModal";
import { useLinear } from "./linearContext";
import { navigate } from "./router";
import { RoomTopBar } from "./RoomTopBar";

export function RoomShell() {
  const { mode, setKey } = useLinear();
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="pp-app">
      <RailNav
        items={[
          { id: "room", label: "Room", icon: "room", active: true, onClick: () => undefined },
          { id: "tickets", label: "Tickets", icon: "tickets", onClick: () => undefined },
          { id: "settings", label: "Settings", icon: "settings", onClick: () => undefined },
        ]}
        bottom={[{ id: "signout", label: "Sign out", icon: "signout", onClick: () => navigate("/") }]}
      />
      <SidePanel title="Tickets">
        <TicketPanel />
      </SidePanel>
      <main className="pp-main">
        <RoomTopBar />
        {mode === "none" && (
          <div className="pp-alert pp-alert--notice" role="status">
            <span className="pp-alert-text">Connect Linear on this device to load tickets.</span>
            <PillButton size="sm" onClick={() => setConnectOpen(true)}>
              Connect Linear
            </PillButton>
          </div>
        )}
        <TicketStage />
        <TableSection />
        <ResultsSection />
      </main>
      <ConnectLinearModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        connect={setKey}
        onConnected={() => setConnectOpen(false)}
      />
    </div>
  );
}
