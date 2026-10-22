import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Ticket } from "@shared/types";
import { IssueChip, IssueLookupContext, truncateTitle } from "./IssueChip";
import { renderMarkdown } from "./markdown";

const ISSUE = "https://linear.app/marshmallow/issue/CTTP-1234/restrict-cancelling-approved-payments";

const known: Ticket = {
  id: "t-1234",
  identifier: "CTTP-1234",
  title: "Restrict cancelling approved payments",
  description: "",
  url: ISSUE,
  teamId: "team",
  teamKey: "CTTP",
  stateName: "Todo",
  assignee: null,
  labels: [],
  currentEstimate: null,
  blockedBy: [],
};

function html(source: string, lookup?: (identifier: string) => Ticket | null): string {
  return renderToStaticMarkup(createElement("div", null, renderMarkdown(source, lookup)));
}

describe("issue link chips", () => {
  it("shows only the identifier when the ticket title is not known", () => {
    const markup = html(`Blocked by [CTTP-1234](${ISSUE}).`);
    expect(markup).toContain(
      `<a class="tk-issue-chip" href="${ISSUE}" target="_blank" rel="noopener noreferrer" title="CTTP-1234"><strong class="tk-issue-chip-id">CTTP-1234</strong></a>`,
    );
    expect(markup).not.toContain("tk-issue-chip-title");
  });

  it("shows the identifier in bold followed by the title when the ticket is known", () => {
    const markup = html(`Blocked by [CTTP-1234](${ISSUE}).`, (identifier) => (identifier === "CTTP-1234" ? known : null));
    expect(markup).toContain('<strong class="tk-issue-chip-id">CTTP-1234</strong>');
    expect(markup).toContain('<span class="tk-issue-chip-title">Restrict cancelling approved payments</span>');
    expect(markup).toContain(`href="${ISSUE}"`);
  });

  it("reads the title from the lookup context when the chip is rendered directly", () => {
    const markup = renderToStaticMarkup(
      createElement(
        IssueLookupContext.Provider,
        { value: () => known },
        createElement(IssueChip, { href: ISSUE, identifier: "CTTP-1234" }),
      ),
    );
    expect(markup).toContain("Restrict cancelling approved payments");
  });

  it("turns bare Linear URLs into chips too", () => {
    const markup = html("see https://linear.app/marshmallow/issue/cttp-9/x.");
    expect(markup).toContain('<strong class="tk-issue-chip-id">CTTP-9</strong>');
    expect(markup).toContain('href="https://linear.app/marshmallow/issue/cttp-9/x"');
  });

  it("keeps other https links as ordinary links", () => {
    const markup = html("[docs](https://example.com/a)");
    expect(markup).toContain('<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(markup).not.toContain("tk-issue-chip");
  });

  it("truncates long titles to 60 characters with an ellipsis", () => {
    const long = "a".repeat(80);
    const truncated = truncateTitle(long);
    expect(Array.from(truncated)).toHaveLength(60);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncateTitle("Short")).toBe("Short");
    const markup = html(`[CTTP-1](${ISSUE})`, () => ({ ...known, title: long }));
    expect(markup).toContain(`<span class="tk-issue-chip-title">${"a".repeat(59)}…</span>`);
  });
});
