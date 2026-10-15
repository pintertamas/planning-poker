import { useEffect, useRef } from "react";
import { useRoomApi } from "../../net/api";
import { useLinear } from "../../app/linearContext";
import { useToast } from "../../ui";
import { errorMessage } from "./ticketHelpers";

export function useWriteback(): void {
  const { state, me, send } = useRoomApi();
  const { service } = useLinear();
  const toast = useToast();
  const inFlight = useRef(new Set<string>());
  const recovered = useRef(false);
  const isHost = me?.isHost === true;
  const entries = state?.tickets ?? null;

  useEffect(() => {
    if (recovered.current || !isHost || !entries) return;
    recovered.current = true;
    for (const entry of entries) {
      if (entry.sync === "syncing") {
        send({ type: "setSync", ticketId: entry.ticket.id, sync: "pending" });
      }
    }
  }, [entries, isHost, send]);

  useEffect(() => {
    if (!isHost || !service || !entries) return;
    for (const entry of entries) {
      const id = entry.ticket.id;
      if (entry.status !== "groomed" || entry.finalEstimate === null || entry.sync !== "pending") continue;
      if (inFlight.current.has(id)) continue;
      inFlight.current.add(id);
      send({ type: "setSync", ticketId: id, sync: "syncing" });
      service
        .commitEstimate(entry.ticket, entry.finalEstimate)
        .then(() => {
          send({ type: "setSync", ticketId: id, sync: "synced" });
        })
        .catch((error: unknown) => {
          send({ type: "setSync", ticketId: id, sync: "failed" });
          toast(errorMessage(error), "error");
        })
        .finally(() => {
          inFlight.current.delete(id);
        });
    }
  }, [entries, isHost, service, send, toast]);
}
