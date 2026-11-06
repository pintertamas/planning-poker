import { useRef } from "react";
import { RailNav, SidePanel, PillButton } from "../ui";
import { TicketPanel } from "../features/tickets/TicketPanel";
import { TicketStage } from "../features/tickets/TicketStage";
import { LinkedTicketModal } from "../features/tickets/LinkedTicketModal";
import { TableSection } from "../features/table/TableSection";
import { ResultsSection } from "../features/table/ResultsSection";
import { useRoomApi } from "../net/api";
import { cx } from "../ui/cx";
import { useLinear } from "./linearContext";
import { navigate } from "./router";
import { RoomTopBar } from "./RoomTopBar";
import { DemoGuideCard } from "./DemoGuideCard";
import { useRoute } from "./router";
import { useAutoScroll } from "./useAutoScroll";

export function RoomShell() {
  const { mode } = useLinear();
  const room = useRoomApi();
  const route = useRoute();
  const code = route.name === "room" ? route.code : "";
  const ticketRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  useAutoScroll(room.state, ticketRef, tableRef);
  const quick = room.state?.mode === "quick";

  return (
    <div className={cx("pp-app", quick && "pp-app--no-panel")}>
      <RailNav
        items={[{ id: "room", label: "Room", icon: "room", active: true, onClick: () => undefined }]}
        bottom={[{ id: "leave", label: "Leave", icon: "signout", onClick: () => navigate("/") }]}
      />
      {!quick && (
        <SidePanel title="Tickets">
          <TicketPanel />
        </SidePanel>
      )}
      <main className="pp-main">
        <RoomTopBar />
        {mode === "demo" && <DemoGuideCard code={code} />}
        {!quick && mode === "none" && room.me?.isHost && (
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
        {!quick && (
          <div ref={ticketRef}>
            <TicketStage />
          </div>
        )}
        {!quick && <LinkedTicketModal />}
        <div ref={tableRef}>
          <TableSection />
        </div>
        <ResultsSection />
      </main>
    </div>
  );
}
