import { useEffect, useRef, type RefObject } from "react";
import type { RoomState } from "@shared/types";
import { prefersReducedMotion, scrollBehavior } from "../features/table/motion";
import { usePeek } from "../features/tickets/peek";
import { scrollTargetFor, type ScrollSnapshot } from "./autoScroll";

export function useAutoScroll(
  state: RoomState | null,
  ticketRef: RefObject<HTMLElement>,
  tableRef: RefObject<HTMLElement>,
): void {
  const { setPeek } = usePeek();
  const previous = useRef<ScrollSnapshot | null>(null);

  useEffect(() => {
    if (state === null) {
      previous.current = null;
      return;
    }
    const next: ScrollSnapshot = {
      currentTicketId: state.currentTicketId,
      phase: state.round.phase,
      endsAt: state.round.endsAt,
    };
    const target = scrollTargetFor(previous.current, next);
    previous.current = next;
    if (target === null) return;
    setPeek(null);
    const element = target === "table" ? tableRef.current : ticketRef.current;
    element?.scrollIntoView({ behavior: scrollBehavior(prefersReducedMotion()), block: "start" });
  }, [state, setPeek, ticketRef, tableRef]);
}
