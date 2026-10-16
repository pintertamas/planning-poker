import type { ReactNode } from "react";
import { PillButton, RailNav, SectionCard, ToastProvider } from "../ui";
import { Landing } from "./pages/Landing";
import { RoomPage } from "./pages/RoomPage";
import { SessionsPage } from "./pages/SessionsPage";
import { navigate, useRoute } from "./router";

function NotFound() {
  return (
    <div className="pp-app pp-app--narrow">
      <RailNav items={[{ id: "start", label: "Start", icon: "room", onClick: () => navigate("/") }]} />
      <main className="pp-main">
        <SectionCard title="Nothing here">
          <p className="pp-muted">That room link does not look right. Check the code or start a new room.</p>
          <div>
            <PillButton onClick={() => navigate("/")}>Back to start</PillButton>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}

export function App() {
  const route = useRoute();
  let screen: ReactNode;
  if (route.name === "room") {
    screen = <RoomPage key={route.code} code={route.code} />;
  } else if (route.name === "landing") {
    screen = <Landing />;
  } else if (route.name === "sessions") {
    screen = <SessionsPage />;
  } else {
    screen = <NotFound />;
  }
  return <ToastProvider>{screen}</ToastProvider>;
}
