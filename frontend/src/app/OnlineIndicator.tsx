import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Player } from "@shared/types";
import { Avatar, Chip, Icon } from "../ui";
import { connectedRoster, placeOnlinePanel, type PanelPlacement } from "./onlineRoster";
import "./online.css";

const CLOSE_DELAY_MS = 150;

type OpenSource = "hover" | "focus" | "click";

export function OnlineIndicator({ players, selfId }: { players: readonly Player[]; selfId: string | null }) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const sourceRef = useRef<OpenSource | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const roster = connectedRoster(players);

  function cancelClose() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }

  function close() {
    cancelClose();
    sourceRef.current = null;
    setOpen(false);
  }

  function openFrom(source: OpenSource) {
    cancelClose();
    if (!open) sourceRef.current = source;
    setOpen(true);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }

  function onTriggerClick() {
    cancelClose();
    if (open && sourceRef.current === "click") {
      close();
      return;
    }
    sourceRef.current = "click";
    setOpen(true);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    function place() {
      if (!trigger) return;
      setPlacement(placeOnlinePanel(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight));
    }
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pp-count pp-online"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onTriggerClick}
        onFocus={() => openFrom("focus")}
        onBlur={close}
        onPointerEnter={(event: ReactPointerEvent<HTMLButtonElement>) => {
          if (event.pointerType === "mouse") openFrom("hover");
        }}
        onPointerLeave={(event: ReactPointerEvent<HTMLButtonElement>) => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
      >
        <Icon name="users" size={16} />
        {roster.length} online
      </button>
      {open &&
        placement &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Connected players"
            className="pp-online-panel"
            style={{ top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
            onPointerEnter={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (event.pointerType === "mouse") cancelClose();
            }}
            onPointerLeave={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (event.pointerType === "mouse") scheduleClose();
            }}
          >
            <p className="pp-online-heading">Connected ({roster.length})</p>
            <ul className="pp-online-list">
              {roster.map((player) => (
                <li key={player.id} className="pp-online-row">
                  <Avatar name={player.name} size={28} />
                  <span className="pp-online-name" title={player.name}>
                    {player.name}
                    {player.id === selfId && <span className="pp-online-you"> (you)</span>}
                  </span>
                  {player.isHost && <Chip tone="dark">host</Chip>}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
