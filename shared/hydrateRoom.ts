import type { ServerRoom, Ticket, TicketEntry } from "./types";

type StoredTicket = Omit<Ticket, "blockedBy"> & { blockedBy?: string[] };
type StoredEntry = Omit<TicketEntry, "ticket"> & { ticket: StoredTicket };
export type StoredRoom = Omit<ServerRoom, "manualOrder" | "tickets"> & {
  manualOrder?: boolean;
  tickets: StoredEntry[];
};

const hydrateEntry = (entry: StoredEntry): TicketEntry => ({
  ...entry,
  ticket: { ...entry.ticket, blockedBy: entry.ticket.blockedBy ?? [] },
});

export function hydrateRoom(stored: StoredRoom): ServerRoom {
  return {
    ...stored,
    manualOrder: stored.manualOrder ?? false,
    tickets: stored.tickets.map(hydrateEntry),
  };
}
