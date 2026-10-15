import { useRoomApi, type ConnectionStatus } from "../net/api";
import { Avatar, Chip, Icon, PillButton, TopBar, useToast } from "../ui";
import { useLinear } from "./linearContext";
import { navigate, useRoute } from "./router";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  open: "Connected",
  reconnecting: "Reconnecting",
  closed: "Disconnected",
};

export function RoomTopBar() {
  const route = useRoute();
  const toast = useToast();
  const { status, state, me, error } = useRoomApi();
  const { mode } = useLinear();
  const code = route.name === "room" ? route.code : "";
  const online = state ? state.players.filter((player) => player.connected).length : 0;
  const dot = status === "open" ? "open" : status === "closed" ? "closed" : "wait";
  const showBanner = status === "closed" || error !== null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied", "success");
    } catch {
      toast("Could not copy the link", "error");
    }
  }

  return (
    <>
      <TopBar
        left={
          <div className="pp-room-id">
            <span className="pp-room-label">Room</span>
            <span className="pp-room-code">{code.toUpperCase()}</span>
            <PillButton size="sm" variant="ghost" icon="link" onClick={copyLink}>
              Copy link
            </PillButton>
          </div>
        }
        center={
          <span className="pp-status">
            <span className={`pp-dot pp-dot--${dot}`} aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        }
        right={
          <>
            <span className="pp-count">
              <Icon name="users" size={16} />
              {online} online
            </span>
            <Chip tone="dark">{mode === "demo" ? "DEMO" : "LIVE"}</Chip>
            {me && <Avatar name={me.name} size={32} />}
          </>
        }
      />
      {showBanner && (
        <div className="pp-alert" role="alert">
          <Icon name="alert" size={18} />
          <span className="pp-alert-text">{error ?? "The connection to this room closed."}</span>
          <PillButton size="sm" variant="secondary" onClick={() => navigate("/")}>
            Back to start
          </PillButton>
        </div>
      )}
    </>
  );
}
