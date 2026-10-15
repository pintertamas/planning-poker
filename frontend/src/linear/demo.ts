import type { Estimate, Ticket } from "@shared/types";
import { parseRefs } from "./parseRefs";
import type { IssuePage, LinearService, LinearTeam, LinearView, ScaleCheck, Viewer } from "./types";

const PAGE_SIZE = 5;
const COMMIT_DELAY_MS = 400;

const DEMO_TEAM: LinearTeam = {
  id: "demo-team",
  key: "DEMO",
  name: "Demo Engineering",
  estimationType: "fibonacci",
  estimationExtended: false,
  estimationAllowZero: false,
  groomedStateId: "demo-groomed",
};

const DEMO_VIEWS: LinearView[] = [
  {
    id: "demo-view-ready",
    name: "Ready for grooming",
    description: "Todo tickets without an estimate",
    shared: true,
    teamKey: "DEMO",
  },
  {
    id: "demo-view-sprint",
    name: "Sprint backlog",
    description: "Everything queued for the next sprint",
    shared: true,
    teamKey: "DEMO",
  },
];

const DEMO_VIEWER: Viewer = { id: "demo-user", name: "Demo User", email: "demo@example.com" };

type Seed = {
  number: number;
  title: string;
  assignee: string | null;
  labels: string[];
  description: string;
};

const SEEDS: Seed[] = [
  {
    number: 101,
    title: "Retry failed payment webhooks with backoff",
    assignee: "Anna Kovacs",
    labels: ["Backend", "Payments"],
    description: [
      "## Context",
      "Payment provider webhooks are dropped when our handler returns a 5xx, so some charges never reach the ledger.",
      "",
      "## Acceptance criteria",
      "- Failed deliveries are retried up to 5 times",
      "- Backoff starts at 30s and doubles on each attempt",
      "- Every attempt is logged with the `webhook_id` and attempt number",
      "",
      "Check the [provider retry policy](https://docs.example.com/webhooks/retries) before picking the interval.",
    ].join("\n"),
  },
  {
    number: 102,
    title: "Dark mode colours for the settings screen",
    assignee: null,
    labels: ["Frontend"],
    description: [
      "## Goal",
      "Settings screen currently ignores the system theme and renders white cards on a dark background.",
      "",
      "## Scope",
      "- Map card, divider and input colours to the existing theme tokens",
      "- Keep contrast at WCAG AA for helper text",
      "- Snapshot the screen in both themes",
    ].join("\n"),
  },
  {
    number: 103,
    title: "Duplicate invoice numbers under concurrent checkout",
    assignee: "Marta Nagy",
    labels: ["Bug", "Backend"],
    description: [
      "## Steps to reproduce",
      "1. Start two checkouts for the same basket within 200ms",
      "2. Both requests read `next_invoice_seq` before either writes it",
      "",
      "## Expected",
      "- Invoice numbers are unique and gap-tolerant",
      "- The sequence is allocated inside the checkout transaction",
    ].join("\n"),
  },
  {
    number: 104,
    title: "Add request tracing IDs to outbound HTTP calls",
    assignee: null,
    labels: ["Observability", "Infra"],
    description: [
      "## Why",
      "When a quote call times out we cannot tell which inbound request caused it.",
      "",
      "## Plan",
      "- Generate a trace ID at the edge if none is present",
      "- Forward it as `x-trace-id` on every outbound call",
      "- Include it in structured logs",
    ].join("\n"),
  },
  {
    number: 105,
    title: "Lazy-load the reports chart bundle",
    assignee: "Levente Szabo",
    labels: ["Performance", "Frontend"],
    description: [
      "## Problem",
      "The reports chart library adds about 380 kB to the initial bundle, and most sessions never open reports.",
      "",
      "## Done when",
      "- The chart module is loaded with a dynamic import",
      "- The initial bundle drops by at least 300 kB",
    ].join("\n"),
  },
  {
    number: 106,
    title: "Rotate service account keys automatically",
    assignee: null,
    labels: ["Security", "Infra"],
    description: [
      "## Context",
      "Service account keys were last rotated by hand fourteen months ago.",
      "",
      "- Rotate every 90 days",
      "- Keep the previous key valid for one deploy window",
      "- Alert in #platform-alerts when a rotation fails",
    ].join("\n"),
  },
  {
    number: 107,
    title: "Document the sandbox onboarding flow",
    assignee: "Bence Toth",
    labels: ["Docs"],
    description: [
      "## Outline",
      "- Requesting sandbox access",
      "- Creating the first test API key",
      "- Sending a sample quote end to end",
      "",
      "Start from the existing notes in the [onboarding runbook](https://docs.example.com/runbooks/sandbox).",
    ].join("\n"),
  },
  {
    number: 108,
    title: "Empty state when search returns no tickets",
    assignee: null,
    labels: ["Frontend"],
    description: [
      "## Current behaviour",
      "An empty search result shows a blank table with no explanation.",
      "",
      "## Desired behaviour",
      "- Show a short message with the query echoed back",
      "- Offer a clear-search button",
    ].join("\n"),
  },
  {
    number: 109,
    title: "Move session cookies to SameSite=Lax",
    assignee: "Anna Kovacs",
    labels: ["Security", "Bug"],
    description: [
      "## Context",
      "The session cookie is still `SameSite=None`, which the security review flagged.",
      "",
      "- Change the cookie attributes in `auth/session.ts`",
      "- Confirm the OAuth callback still works from the partner portal",
    ].join("\n"),
  },
  {
    number: 110,
    title: "Remove the legacy quote v1 endpoint",
    assignee: null,
    labels: ["Tech debt", "Backend"],
    description: [
      "## Background",
      "Quote v1 has had no traffic from production clients since the v2 migration finished.",
      "",
      "## Checklist",
      "- Confirm zero hits for two weeks in the access logs",
      "- Delete the route and its handler tests",
      "- Remove the v1 schema from the public docs",
    ].join("\n"),
  },
  {
    number: 111,
    title: "Push notification deep links open the wrong claim",
    assignee: "Dora Varga",
    labels: ["Mobile", "Bug"],
    description: [
      "## Steps to reproduce",
      "1. Receive a push for claim CL-2231 while the app is backgrounded",
      "2. Tap the notification",
      "",
      "The app opens the most recently viewed claim instead of the one in the payload.",
    ].join("\n"),
  },
  {
    number: 112,
    title: "Paginate the ledger export to avoid timeouts",
    assignee: null,
    labels: ["Backend", "Performance"],
    description: [
      "## Problem",
      "Exports over 50k rows hit the 30s gateway timeout and return a 504.",
      "",
      "## Approach",
      "- Stream the export in pages of 5k rows",
      "- Return a signed URL once the file is complete",
    ].join("\n"),
  },
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEMO_TICKETS: Ticket[] = SEEDS.map((seed) => {
  const identifier = `DEMO-${seed.number}`;
  return {
    id: `demo-issue-${seed.number}`,
    identifier,
    title: seed.title,
    description: seed.description,
    url: `https://linear.app/demo/issue/${identifier}/${slugify(seed.title)}`,
    teamId: DEMO_TEAM.id,
    teamKey: DEMO_TEAM.key,
    stateName: "Todo",
    assignee: seed.assignee,
    labels: seed.labels,
    currentEstimate: null,
  };
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageOf(tickets: Ticket[], cursor?: string): IssuePage {
  const start = cursor ? Number(cursor) : 0;
  const end = start + PAGE_SIZE;
  return {
    tickets: tickets.slice(start, end),
    nextCursor: end < tickets.length ? String(end) : null,
  };
}

export function createDemoService(): LinearService {
  const estimates = new Map<string, Estimate>();

  function currentTickets(): Ticket[] {
    return DEMO_TICKETS.map((ticket) => ({
      ...ticket,
      currentEstimate: estimates.get(ticket.id) ?? ticket.currentEstimate,
    }));
  }

  function byRefs(refs: string[]): { tickets: Ticket[]; notFound: string[] } {
    const all = currentTickets();
    const tickets: Ticket[] = [];
    const notFound: string[] = [];
    for (const ref of refs) {
      const found = all.find((ticket) => ticket.identifier === ref.toUpperCase());
      if (found) {
        tickets.push(found);
      } else {
        notFound.push(ref);
      }
    }
    return { tickets, notFound };
  }

  return {
    mode: "demo",
    async getViewer() {
      return DEMO_VIEWER;
    },
    async listTeams() {
      return [DEMO_TEAM];
    },
    async listViews() {
      return DEMO_VIEWS;
    },
    async issuesFromView(_viewId: string, cursor?: string) {
      return pageOf(currentTickets(), cursor);
    },
    async issuesFromTeam(_teamId: string, cursor?: string) {
      return pageOf(currentTickets(), cursor);
    },
    async issuesByRefs(refs: string[]) {
      return byRefs(refs);
    },
    async searchIssues(query: string) {
      const trimmed = query.trim();
      if (trimmed === "") return [];
      const refs = parseRefs(trimmed);
      if (refs.length > 0) return byRefs(refs).tickets;
      const needle = trimmed.toLowerCase();
      return currentTickets()
        .filter((ticket) => ticket.title.toLowerCase().includes(needle))
        .slice(0, 25);
    },
    async checkEstimateScale(teamId: string): Promise<ScaleCheck> {
      if (teamId !== DEMO_TEAM.id) {
        return { ok: false, reason: "This team was not found in your Linear workspace" };
      }
      return { ok: true, reason: null };
    },
    async commitEstimate(ticket: Ticket, estimate: Estimate) {
      await delay(COMMIT_DELAY_MS);
      estimates.set(ticket.id, estimate);
    },
  };
}
