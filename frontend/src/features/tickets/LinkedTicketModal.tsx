import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Ticket } from "@shared/types";
import { useLinear } from "../../app/linearContext";
import { useRoomApi } from "../../net/api";
import { HeroCard, Icon, Modal } from "../../ui";
import { OpenInLinearLink, TicketView } from "./TicketView";
import { findKnownTicket, unresolvedIdentifiers, type IssueLookup } from "./issueLinks";
import { back, closeLinked, useLinkedStack } from "./linkedStack";
import { isHttpUrl } from "./ticketHelpers";

type LoadStatus = "loading" | "missing" | "failed";

const NOT_LOADED_COPY =
  "This ticket has not been loaded into the session. Ask someone signed in with Linear to open it, or open it in Linear.";
const MISSING_COPY = "Linear did not return this ticket. It may not exist, or your Linear account cannot see it.";
const FAILED_COPY = "This ticket could not be loaded from Linear right now. Open it in Linear instead.";
const LOADING_COPY = "Loading this ticket from Linear";

const linearIssueUrl = (identifier: string): string => `https://linear.app/issue/${identifier}`;

function byIdentifier(tickets: Ticket[]): Record<string, Ticket> {
  return Object.fromEntries(tickets.map((ticket) => [ticket.identifier.toUpperCase(), ticket]));
}

function UnavailableTicket({
  identifier,
  url,
  message,
  loading,
}: {
  identifier: string;
  url: string;
  message: string;
  loading: boolean;
}) {
  return (
    <HeroCard title={identifier}>
      {loading ? (
        <div className="tk-loading" role="status">
          <span className="tk-spin" aria-hidden="true">
            <Icon name="refresh" size={16} />
          </span>
          {message}
        </div>
      ) : (
        <p className="pp-muted">{message}</p>
      )}
      {isHttpUrl(url) && (
        <div className="pp-hero-actions">
          <a className="pp-btn pp-btn--secondary pp-btn--md tk-link-btn" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={16} />
            Open in Linear
          </a>
        </div>
      )}
    </HeroCard>
  );
}

export function LinkedTicketModal() {
  const stack = useLinkedStack();
  const { state, send } = useRoomApi();
  const { service } = useLinear();
  const [fetched, setFetched] = useState<Record<string, Ticket>>({});
  const [status, setStatus] = useState<Record<string, LoadStatus>>({});
  const requested = useRef(new Set<string>());
  const prefetched = useRef(new Set<string>());

  const top = stack[stack.length - 1] ?? null;
  const topId = top?.identifier ?? null;
  const lookup: IssueLookup = (identifier) =>
    findKnownTicket(identifier, state) ?? fetched[identifier.toUpperCase()] ?? null;
  const known = topId === null ? null : lookup(topId);

  useEffect(() => {
    if (!service || topId === null || known !== null || requested.current.has(topId)) return;
    requested.current.add(topId);
    setStatus((previous) => ({ ...previous, [topId]: "loading" }));
    service.issuesByRefs([topId]).then(
      ({ tickets }) => {
        const found = tickets.find((ticket) => ticket.identifier.toUpperCase() === topId);
        if (found === undefined) {
          setStatus((previous) => ({ ...previous, [topId]: "missing" }));
          return;
        }
        setFetched((previous) => ({ ...previous, [topId]: found }));
        send({ type: "addReferences", tickets: [found] });
      },
      () => {
        requested.current.delete(topId);
        setStatus((previous) => ({ ...previous, [topId]: "failed" }));
      },
    );
  }, [service, topId, known, send]);

  useEffect(() => {
    if (!service || known === null) return;
    const knownKeys = new Set<string>([
      ...(state?.tickets ?? []).map((entry) => entry.ticket.identifier.toUpperCase()),
      ...Object.keys(state?.references ?? {}),
      ...prefetched.current,
      ...requested.current,
      known.identifier.toUpperCase(),
    ]);
    const identifiers = unresolvedIdentifiers([known.description], knownKeys);
    if (identifiers.length === 0) return;
    for (const identifier of identifiers) prefetched.current.add(identifier);
    service.issuesByRefs(identifiers).then(
      ({ tickets }) => {
        if (tickets.length === 0) return;
        setFetched((previous) => ({ ...previous, ...byIdentifier(tickets) }));
        send({ type: "addReferences", tickets });
      },
      () => undefined,
    );
  }, [service, known, send]);

  let content: ReactNode = null;
  if (top !== null) {
    if (known !== null) {
      content = <TicketView ticket={known} lookup={lookup} />;
    } else {
      const url = top.url ?? linearIssueUrl(top.identifier);
      const loadStatus = status[top.identifier];
      if (!service) {
        content = <UnavailableTicket identifier={top.identifier} url={url} message={NOT_LOADED_COPY} loading={false} />;
      } else if (loadStatus === undefined || loadStatus === "loading") {
        content = <UnavailableTicket identifier={top.identifier} url={url} message={LOADING_COPY} loading />;
      } else if (loadStatus === "missing") {
        content = <UnavailableTicket identifier={top.identifier} url={url} message={MISSING_COPY} loading={false} />;
      } else {
        content = <UnavailableTicket identifier={top.identifier} url={url} message={FAILED_COPY} loading={false} />;
      }
    }
  }

  const leading =
    stack.length > 1 ? (
      <button type="button" className="pp-round" aria-label="Back to previous ticket" onClick={back}>
        <Icon name="arrow-left" size={16} />
      </button>
    ) : undefined;

  return (
    <Modal open={top !== null} onClose={closeLinked} title={topId ?? "Linked ticket"} wide leading={leading}>
      <div className="tk-stage">{content}</div>
    </Modal>
  );
}
