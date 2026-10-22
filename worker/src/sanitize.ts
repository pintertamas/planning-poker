import { MAX_REFERENCES, MAX_TICKETS } from "@shared/types";
import type { ClientAction, Estimate, Ticket, TicketSync } from "@shared/types";

const TICKET_SYNC_VALUES: readonly unknown[] = ["none", "pending", "syncing", "synced", "failed"];
const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 50;
const MAX_BLOCKERS = 20;
const MAX_ID_LENGTH = 200;
const MAX_BLOCKER_ID_LENGTH = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clip = (value: string, max: number): string => Array.from(value).slice(0, max).join("");

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value === "string") return clip(value, max);
  if (typeof value === "number" || typeof value === "boolean") return clip(String(value), max);
  return undefined;
};

const nullableText = (value: unknown, max: number): string | null | undefined =>
  value === null ? null : text(value, max);

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const nullableFinite = (value: unknown): number | null | undefined =>
  value === null ? null : finite(value);

const sanitizeLabels = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length > MAX_LABELS) return undefined;
  const labels: string[] = [];
  for (const raw of value) {
    const label = text(raw, MAX_LABEL_LENGTH);
    if (label === undefined) return undefined;
    labels.push(label);
  }
  return labels;
};

const sanitizeBlockedBy = (value: unknown): string[] | undefined => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_BLOCKERS) return undefined;
  const blockers: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || Array.from(raw).length > MAX_BLOCKER_ID_LENGTH) return undefined;
    blockers.push(raw);
  }
  return blockers;
};

const sanitizeIdList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length > MAX_TICKETS) return undefined;
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || Array.from(raw).length > MAX_ID_LENGTH) return undefined;
    ids.push(raw);
  }
  return ids;
};

const sanitizeTicket = (value: unknown): Ticket | undefined => {
  if (!isRecord(value)) return undefined;
  const id = text(value.id, 200);
  const identifier = text(value.identifier, 200);
  const title = text(value.title, 300);
  const description = text(value.description, 8000);
  const url = text(value.url, 200);
  const teamId = text(value.teamId, 200);
  const teamKey = text(value.teamKey, 200);
  const stateName = text(value.stateName, 200);
  const assignee = nullableText(value.assignee, 100);
  const labels = sanitizeLabels(value.labels);
  const currentEstimate = nullableFinite(value.currentEstimate);
  const blockedBy = sanitizeBlockedBy(value.blockedBy);
  if (
    id === undefined ||
    identifier === undefined ||
    title === undefined ||
    description === undefined ||
    url === undefined ||
    teamId === undefined ||
    teamKey === undefined ||
    stateName === undefined ||
    assignee === undefined ||
    labels === undefined ||
    currentEstimate === undefined ||
    blockedBy === undefined
  ) {
    return undefined;
  }
  return {
    id,
    identifier,
    title,
    description,
    url,
    teamId,
    teamKey,
    stateName,
    assignee,
    labels,
    currentEstimate,
    blockedBy,
  };
};

const sanitizeTickets = (value: unknown, limit: number = MAX_TICKETS): Ticket[] | undefined => {
  if (!Array.isArray(value) || value.length > limit) return undefined;
  const tickets: Ticket[] = [];
  for (const raw of value) {
    const ticket = sanitizeTicket(raw);
    if (ticket === undefined) return undefined;
    tickets.push(ticket);
  }
  return tickets;
};

export function sanitizeAction(action: unknown): ClientAction | null {
  if (!isRecord(action) || typeof action.type !== "string") return null;
  switch (action.type) {
    case "rename": {
      return typeof action.name === "string" ? { type: "rename", name: action.name } : null;
    }
    case "vote": {
      return typeof action.value === "number"
        ? { type: "vote", value: action.value as Estimate }
        : null;
    }
    case "addTickets": {
      const tickets = sanitizeTickets(action.tickets);
      return tickets === undefined ? null : { type: "addTickets", tickets };
    }
    case "addReferences": {
      const tickets = sanitizeTickets(action.tickets, MAX_REFERENCES);
      return tickets === undefined ? null : { type: "addReferences", tickets };
    }
    case "removeTicket": {
      return typeof action.ticketId === "string"
        ? { type: "removeTicket", ticketId: action.ticketId }
        : null;
    }
    case "setCurrent": {
      return typeof action.ticketId === "string"
        ? { type: "setCurrent", ticketId: action.ticketId }
        : null;
    }
    case "startRound": {
      return { type: "startRound" };
    }
    case "reveal": {
      return { type: "reveal" };
    }
    case "revote": {
      return { type: "revote" };
    }
    case "accept": {
      return typeof action.estimate === "number"
        ? { type: "accept", estimate: action.estimate as Estimate }
        : null;
    }
    case "setSync": {
      if (typeof action.ticketId !== "string") return null;
      if (!TICKET_SYNC_VALUES.includes(action.sync)) return null;
      return { type: "setSync", ticketId: action.ticketId, sync: action.sync as TicketSync };
    }
    case "reorderTickets": {
      const ticketIds = sanitizeIdList(action.ticketIds);
      return ticketIds === undefined ? null : { type: "reorderTickets", ticketIds };
    }
    case "resetOrder": {
      return { type: "resetOrder" };
    }
    case "updateSettings": {
      const durationSec = action.durationSec === undefined ? undefined : finite(action.durationSec);
      const autoRevealWhenAllVoted =
        action.autoRevealWhenAllVoted === undefined
          ? undefined
          : typeof action.autoRevealWhenAllVoted === "boolean"
            ? action.autoRevealWhenAllVoted
            : undefined;
      if (action.durationSec !== undefined && durationSec === undefined) return null;
      if (action.autoRevealWhenAllVoted !== undefined && autoRevealWhenAllVoted === undefined) {
        return null;
      }
      return { type: "updateSettings", durationSec, autoRevealWhenAllVoted };
    }
    default:
      return null;
  }
}
