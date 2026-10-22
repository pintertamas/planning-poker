import type { ReactNode } from "react";
import type { Ticket } from "@shared/types";
import { Chip, HeroCard, Icon, LabelValue, SectionCard } from "../../ui";
import { renderMarkdown } from "./markdown";
import type { IssueLookup } from "./issueLinks";
import { isHttpUrl, pointsLabel } from "./ticketHelpers";

export function OpenInLinearLink({ url }: { url: string }) {
  return (
    <a className="pp-btn pp-btn--secondary pp-btn--md tk-link-btn" href={url} target="_blank" rel="noopener noreferrer">
      <Icon name="link" size={16} />
      Open in Linear
    </a>
  );
}

export function TicketView({
  ticket,
  lookup,
  tags,
  actions,
  details,
}: {
  ticket: Ticket;
  lookup: IssueLookup;
  tags?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
}) {
  const chips = (
    <>
      <Chip tone="blue">{ticket.teamKey}</Chip>
      <Chip tone="outline">{ticket.stateName}</Chip>
      {ticket.currentEstimate !== null && <Chip tone="teal">{pointsLabel(ticket.currentEstimate)}</Chip>}
      {tags}
    </>
  );

  return (
    <>
      <HeroCard chips={chips} title={ticket.title}>
        <div className="pp-hero-actions tk-stage-actions">
          {isHttpUrl(ticket.url) && <OpenInLinearLink url={ticket.url} />}
          {actions}
        </div>
      </HeroCard>
      <SectionCard title="Description">{renderMarkdown(ticket.description, lookup)}</SectionCard>
      <SectionCard title="Details">
        <div className="pp-grid">
          <LabelValue label="Identifier">{ticket.identifier}</LabelValue>
          <LabelValue label="Assignee">{ticket.assignee ?? "Unassigned"}</LabelValue>
          <LabelValue label="Labels">
            {ticket.labels.length > 0 ? (
              <span className="tk-chips">
                {ticket.labels.map((label) => (
                  <Chip key={label} tone="outline">
                    {label}
                  </Chip>
                ))}
              </span>
            ) : (
              "None"
            )}
          </LabelValue>
          <LabelValue label="Linear estimate">
            {ticket.currentEstimate !== null ? pointsLabel(ticket.currentEstimate) : "Not set"}
          </LabelValue>
          <LabelValue label="Linear status">{ticket.stateName}</LabelValue>
          {details}
        </div>
      </SectionCard>
    </>
  );
}
