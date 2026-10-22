import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { TicketEntry } from "@shared/types";
import {
  dropIndex,
  moveItem,
  orderedBy,
  positionAnnouncement,
  segmentOf,
  stepTarget,
  type Segment,
} from "./ticketOrderView";

export type Drag = {
  id: string;
  from: number;
  segment: Segment;
  grabOffset: number;
  left: number;
  width: number;
  pointerY: number;
  target: number;
  lineY: number | null;
};

type Options = {
  entries: TicketEntry[];
  serverKey: unknown;
  enabled: boolean;
  sendOrder: (ticketIds: string[]) => void;
};

const EDGE_PX = 56;
const MAX_STEP_PX = 18;

function scrollContainerOf(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current !== null) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function edgeStep(pointerY: number, top: number, bottom: number): number {
  let step = 0;
  if (pointerY < top + EDGE_PX) step = -((top + EDGE_PX - pointerY) / EDGE_PX) * MAX_STEP_PX;
  if (pointerY > bottom - EDGE_PX) step = ((pointerY - (bottom - EDGE_PX)) / EDGE_PX) * MAX_STEP_PX;
  return Math.round(Math.max(-MAX_STEP_PX, Math.min(MAX_STEP_PX, step)));
}

export function useTicketReorder({ entries, serverKey, enabled, sendOrder }: Options) {
  const [pending, setPending] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const displayed = useMemo(() => (pending === null ? entries : orderedBy(entries, pending)), [entries, pending]);
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;
  const dragRef = useRef<Drag | null>(null);
  const pointerYRef = useRef(0);
  const rows = useRef(new Map<string, HTMLElement>());
  const grips = useRef(new Map<string, HTMLElement>());
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterMove = useRef<string | null>(null);
  const dragging = drag !== null;

  const commit = (list: TicketEntry[]): void => {
    const ids = list.map((item) => item.ticket.id);
    setPending(ids);
    sendOrder(ids);
  };

  const finish = (apply: boolean): void => {
    const current = dragRef.current;
    if (current === null) return;
    dragRef.current = null;
    setDrag(null);
    if (apply && current.target !== current.from) {
      const list = displayedRef.current;
      commit(moveItem(list, current.from, current.target));
      const identifier = list[current.from]?.ticket.identifier ?? current.id;
      setAnnouncement(positionAnnouncement(identifier, current.target + 1, list.length));
    }
  };

  const updateDrag = (pointerY: number): void => {
    const current = dragRef.current;
    if (current === null) return;
    const list = displayedRef.current;
    const { start, end } = current.segment;
    const span = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    const midpoints: number[] = [];
    for (const index of span) {
      const row = rows.current.get(list[index]?.ticket.id ?? "");
      if (row === undefined) return;
      const rect = row.getBoundingClientRect();
      midpoints.push(rect.top + rect.height / 2);
    }
    const target = dropIndex(current.segment, current.from, midpoints, pointerY);
    const others = span.filter((index) => index !== current.from);
    const base = listRef.current?.getBoundingClientRect().top ?? 0;
    let lineY: number | null = null;
    if (target !== current.from) {
      const anchorIndex = others[target - start];
      const anchor = anchorIndex === undefined ? undefined : rows.current.get(list[anchorIndex]?.ticket.id ?? "");
      if (anchor !== undefined) {
        lineY = anchor.getBoundingClientRect().top - base - 2;
      } else {
        const lastIndex = others[others.length - 1];
        const last = lastIndex === undefined ? undefined : rows.current.get(list[lastIndex]?.ticket.id ?? "");
        if (last !== undefined) lineY = last.getBoundingClientRect().bottom - base + 2;
      }
    }
    const next: Drag = { ...current, pointerY, target, lineY };
    dragRef.current = next;
    setDrag(next);
  };

  const onGripPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string): void => {
    if (!enabled || event.button !== 0) return;
    const list = displayedRef.current;
    const index = list.findIndex((item) => item.ticket.id === id);
    const row = rows.current.get(id);
    if (index === -1 || list[index]?.status !== "todo" || row === undefined) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = row.getBoundingClientRect();
    pointerYRef.current = event.clientY;
    const next: Drag = {
      id,
      from: index,
      segment: segmentOf(list, index),
      grabOffset: event.clientY - rect.top,
      left: rect.left,
      width: rect.width,
      pointerY: event.clientY,
      target: index,
      lineY: null,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const onGripPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragRef.current === null) return;
    pointerYRef.current = event.clientY;
    updateDrag(event.clientY);
  };

  const onGripPointerUp = (): void => finish(true);

  const onGripPointerCancel = (): void => finish(false);

  const onGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: string): void => {
    if (!enabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const list = displayedRef.current;
    const index = list.findIndex((item) => item.ticket.id === id);
    const entry = list[index];
    if (entry === undefined || entry.status !== "todo") return;
    const to = stepTarget(segmentOf(list, index), index, event.key === "ArrowUp" ? -1 : 1);
    if (to === null) return;
    focusAfterMove.current = id;
    commit(moveItem(list, index, to));
    setAnnouncement(positionAnnouncement(entry.ticket.identifier, to + 1, list.length));
  };

  useEffect(() => {
    setPending(null);
    finish(false);
  }, [serverKey]);

  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const tick = (): void => {
      const container = scrollContainerOf(listRef.current);
      const bounds = container?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const step = edgeStep(pointerYRef.current, bounds.top, bounds.bottom);
      if (step !== 0) {
        if (container) {
          container.scrollTop += step;
        } else {
          window.scrollBy(0, step);
        }
        updateDrag(pointerYRef.current);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dragging]);

  useEffect(() => {
    const id = focusAfterMove.current;
    if (id === null) return;
    focusAfterMove.current = null;
    grips.current.get(id)?.focus();
  }, [displayed]);

  return {
    listRef,
    displayed,
    drag,
    announcement,
    setRow: (id: string, el: HTMLElement | null): void => {
      if (el === null) rows.current.delete(id);
      else rows.current.set(id, el);
    },
    setGrip: (id: string, el: HTMLElement | null): void => {
      if (el === null) grips.current.delete(id);
      else grips.current.set(id, el);
    },
    onGripPointerDown,
    onGripPointerMove,
    onGripPointerUp,
    onGripPointerCancel,
    onGripKeyDown,
  };
}
