import type { Estimate, Ticket } from "@shared/types";
import { identifiersFor, issueNumber, matchesIdQuery, mergeTickets, parseIdQuery, SEARCH_LIMIT } from "./searchPlan";
import type {
  IssuePage,
  LinearProject,
  LinearService,
  LinearTeam,
  LinearView,
  ProjectIssueOptions,
  ScaleCheck,
  Viewer,
} from "./types";

const PAGE_SIZE = 5;
const CLOSED_STATES = ["Done", "Canceled"];
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

const VIEW = {
  sprint: "demo-view-sprint",
  ready: "demo-view-ready",
  blocked: "demo-view-blocked",
  tables: "demo-view-tables",
  techDebt: "demo-view-tech-debt",
  customers: "demo-view-customers",
} as const;

const PROJECT = {
  payments: "demo-project-payments",
  docusense: "demo-project-docusense",
  claims: "demo-project-claims-finance",
  mobile: "demo-project-mobile",
} as const;

const DEMO_VIEWS: LinearView[] = [
  {
    id: VIEW.sprint,
    name: "Sprint backlog",
    description: "Everything queued for the next sprint",
    shared: true,
    teamKey: "DEMO",
    favorite: true,
    favoriteOrder: 1,
  },
  {
    id: VIEW.ready,
    name: "Ready for grooming",
    description: "Todo tickets without an estimate",
    shared: true,
    teamKey: "DEMO",
    favorite: true,
    favoriteOrder: 2,
  },
  {
    id: VIEW.blocked,
    name: "Blocked work",
    description: "Tickets waiting on another ticket to land",
    shared: true,
    teamKey: "DEMO",
    favorite: false,
    favoriteOrder: null,
  },
  {
    id: VIEW.tables,
    name: "Tables and links showcase",
    description: "Descriptions with tables, issue links and chips",
    shared: true,
    teamKey: "DEMO",
    favorite: false,
    favoriteOrder: null,
  },
  {
    id: VIEW.techDebt,
    name: "Tech debt",
    description: "Cleanup we keep pushing back",
    shared: false,
    teamKey: "DEMO",
    favorite: false,
    favoriteOrder: null,
  },
  {
    id: VIEW.customers,
    name: "Customer requests",
    description: "What customers asked for this quarter",
    shared: false,
    teamKey: "DEMO",
    favorite: false,
    favoriteOrder: null,
  },
];

const DEMO_PROJECTS: LinearProject[] = [
  {
    id: PROJECT.payments,
    name: "Payment Improvements",
    slugId: "9c2e5b7a1f40",
    stateName: "In Progress",
    teamKeys: ["DEMO"],
  },
  {
    id: PROJECT.docusense,
    name: "Docusense for medical report",
    slugId: "5aacc6eaba64",
    stateName: "Planned",
    teamKeys: ["DEMO"],
  },
  {
    id: PROJECT.claims,
    name: "Claims Finance Reporting",
    slugId: "e41d08b3c6a9",
    stateName: "Backlog",
    teamKeys: ["DEMO", "OPS"],
  },
  {
    id: PROJECT.mobile,
    name: "Mobile polish",
    slugId: "b07f3a92d18e",
    stateName: "Paused",
    teamKeys: ["DEMO"],
  },
];

const DEMO_VIEWER: Viewer = { id: "demo-user", name: "Demo User", email: "demo@example.com" };

type Seed = {
  number: number;
  title: string;
  assignee: string | null;
  labels: string[];
  state?: string;
  estimate?: Estimate;
  project?: string;
  views?: string[];
  blockedBy?: number[];
  description: string;
};

const body = (...lines: string[]): string => lines.join("\n");

const SEEDS: Seed[] = [
  {
    number: 101,
    title: "Retry failed payment webhooks with backoff",
    assignee: "Anna Kovacs",
    labels: ["Backend", "Payments"],
    project: PROJECT.payments,
    views: [VIEW.ready, VIEW.sprint],
    description: body(
      "## Context",
      "Payment provider webhooks are dropped when our handler returns a 5xx, so some charges never reach the ledger.",
      "",
      "## Acceptance criteria",
      "- Failed deliveries are retried up to **5 times**",
      "- Backoff starts at 30s and *doubles* on each attempt",
      "- Every attempt is logged with the `webhook_id` and attempt number",
      "",
      "## Rollout",
      "1. Ship the retry queue behind `PAYMENTS_RETRY_V2`",
      "2. Watch the dead-letter count for two days",
      "3. Remove the flag",
      "",
      "> Retries must reuse the original idempotency key, or a delayed charge can turn into a duplicate.",
      "",
      "Check the [provider retry policy](https://docs.example.com/webhooks/retries) before picking the interval.",
    ),
  },
  {
    number: 102,
    title: "Dark mode colours for the settings screen",
    assignee: null,
    labels: ["Frontend"],
    project: PROJECT.mobile,
    views: [VIEW.ready, VIEW.blocked, VIEW.customers],
    description: body(
      "## Goal",
      "The settings screen ignores the system theme and renders white cards on a dark background.",
      "",
      "## Scope",
      "- Map card, divider and input colours to the existing theme tokens",
      "- Keep contrast at WCAG AA for helper text",
      "- Snapshot the screen in *both* themes",
      "",
      "Design spec: [settings dark mode](https://docs.example.com/design/settings-dark-mode).",
    ),
  },
  {
    number: 103,
    title: "Duplicate invoice numbers under concurrent checkout",
    assignee: "Marta Nagy",
    labels: ["Bug", "Backend"],
    estimate: 3,
    project: PROJECT.payments,
    views: [VIEW.sprint, VIEW.customers],
    description: body(
      "## Steps to reproduce",
      "1. Start two checkouts for the same basket within 200ms",
      "2. Both requests read `next_invoice_seq` before either writes it",
      "",
      "## Expected",
      "- Invoice numbers are unique and gap-tolerant",
      "- The sequence is allocated inside the checkout transaction",
      "",
      "Reported by a customer on the **Harrow Motor** account. See the [incident notes](https://docs.example.com/incidents/invoice-seq).",
    ),
  },
  {
    number: 104,
    title: "Add request tracing IDs to outbound HTTP calls",
    assignee: null,
    labels: ["Observability", "Infra"],
    views: [VIEW.ready, VIEW.blocked],
    description: body(
      "## Why",
      "When a quote call times out we cannot tell which inbound request caused it.",
      "",
      "## Plan",
      "- Generate a trace ID at the edge if none is present",
      "- Forward it as `x-trace-id` on every outbound call",
      "- Include it in structured logs",
      "",
      "```ts",
      'const traceId = request.headers.get("x-trace-id") ?? crypto.randomUUID();',
      "```",
    ),
  },
  {
    number: 105,
    title: "Lazy-load the reports chart bundle",
    assignee: "Levente Szabo",
    labels: ["Performance", "Frontend"],
    project: PROJECT.claims,
    views: [VIEW.ready, VIEW.blocked, VIEW.techDebt],
    blockedBy: [112],
    description: body(
      "## Problem",
      "The reports chart library adds about 380 kB to the initial bundle, and most sessions never open reports.",
      "",
      "## Done when",
      "- The chart module is loaded with a dynamic `import()`",
      "- The initial bundle drops by at least 300 kB",
      "- A skeleton holds the space while the chunk loads",
      "",
      "Wait for [the ledger export pagination](https://linear.app/marshmallow/issue/DEMO-112/paginate-the-ledger-export-to-avoid-timeouts) to land first, so the reports screen is not changed twice.",
    ),
  },
  {
    number: 106,
    title: "Rotate service account keys automatically",
    assignee: null,
    labels: ["Security", "Infra"],
    views: [VIEW.ready, VIEW.blocked],
    blockedBy: [112],
    description: body(
      "## Context",
      "Service account keys were last rotated by hand fourteen months ago.",
      "",
      "- Rotate every 90 days",
      "- Keep the previous key valid for one deploy window",
      "- Alert in #platform-alerts when a rotation fails",
      "",
      "Start after [the ledger export pagination](https://linear.app/marshmallow/issue/DEMO-112/paginate-the-ledger-export-to-avoid-timeouts), which uses the same service account.",
    ),
  },
  {
    number: 107,
    title: "Map GP letter fields into the report template",
    assignee: "Bence Toth",
    labels: ["Docs", "Medical"],
    project: PROJECT.docusense,
    views: [VIEW.ready, VIEW.tables],
    description: body(
      "## Field mapping",
      "Every field from the GP letter has a home in the report. Anything unmapped goes to the appendix.",
      "",
      "| GP letter field | Report section | Required | Notes |",
      "|:----------------|:--------------:|---------:|:------|",
      "| `patient_dob`   | Header         | **Yes**  | *Validate* against the claim |",
      "| `diagnosis_code`| Findings       | **Yes**  | Map through the [ICD-10 lookup](https://docs.example.com/icd10) |",
      "| `referral_date` | Timeline       | No       | Use `YYYY-MM-DD` |",
      "| `clinic_name`   | Footer         | No       | Match against the clinic directory |",
      "",
      "Start from the [mapping spec](https://docs.example.com/docusense/field-mapping). Background on the extraction rules is in [DEMO-201](https://linear.app/marshmallow/issue/DEMO-201/extraction-rules-for-empty-report-sections).",
    ),
  },
  {
    number: 108,
    title: "Show a fallback when a report section has no data",
    assignee: null,
    labels: ["Frontend"],
    project: PROJECT.docusense,
    views: [VIEW.ready, VIEW.blocked, VIEW.tables],
    blockedBy: [111],
    description: body(
      "## Current behaviour",
      "An empty section renders a blank card, so reviewers assume the extraction failed.",
      "",
      "## Desired behaviour",
      "- Show a short message with the section name",
      "- Link the message to the [extraction rules](https://linear.app/marshmallow/issue/DEMO-201/extraction-rules-for-empty-report-sections)",
      "- Keep the section visible for the audit trail",
      "",
      "Needs [regenerated sections on amendment](https://linear.app/marshmallow/issue/DEMO-111/regenerate-report-sections-when-a-claim-is-amended) first, because an amended claim can fill an empty section.",
    ),
  },
  {
    number: 109,
    title: "Move session cookies to SameSite=Lax",
    assignee: "Anna Kovacs",
    labels: ["Security", "Bug"],
    state: "In Progress",
    project: PROJECT.payments,
    views: [VIEW.sprint],
    description: body(
      "## Context",
      "The session cookie is still `SameSite=None`, which the security review flagged.",
      "",
      "- Change the cookie attributes in `auth/session.ts`",
      "- Confirm the OAuth callback still works from the partner portal",
      "",
      "*Review is on the way once the callback test passes.*",
    ),
  },
  {
    number: 110,
    title: "Retire the v1 report renderer",
    assignee: null,
    labels: ["Tech debt", "Backend"],
    estimate: 5,
    project: PROJECT.docusense,
    views: [VIEW.blocked, VIEW.sprint, VIEW.tables, VIEW.techDebt],
    blockedBy: [113],
    description: body(
      "## Background",
      "The v1 report renderer still serves about 2% of reports, all from partners on the old template.",
      "",
      "## Checklist",
      "- Confirm zero v1 hits for two weeks in the access logs",
      "- Delete the renderer and its snapshot tests",
      "- Remove the v1 template from the public docs",
      "",
      "Frozen template: [legacy PDF template](https://linear.app/marshmallow/issue/DEMO-113/freeze-the-legacy-pdf-template-for-v1-reports). Partner list: [DEMO-204](https://linear.app/marshmallow/issue/DEMO-204/partner-list-for-the-v1-renderer).",
      "",
      "Old runbook: https://linear.app/marshmallow/issue/DEMO-999/retire-the-v0-report-hook",
    ),
  },
  {
    number: 111,
    title: "Regenerate report sections when a claim is amended",
    assignee: "Dora Varga",
    labels: ["Backend", "Reports"],
    estimate: 5,
    project: PROJECT.docusense,
    views: [VIEW.blocked, VIEW.sprint, VIEW.tables],
    blockedBy: [114],
    description: body(
      "## Steps to reproduce",
      "1. Amend a claim after its medical report was generated",
      "2. Open the report and compare the sections with the amended claim",
      "",
      "The sections stay on the old values until someone regenerates the report by hand.",
      "",
      "## Expected",
      "- Amendments mark the affected sections as stale",
      "- Regeneration runs from the amendment event, see [the amendment events](https://linear.app/marshmallow/issue/DEMO-114/publish-claim-amendment-events-from-the-claims-service)",
    ),
  },
  {
    number: 112,
    title: "Paginate the ledger export to avoid timeouts",
    assignee: null,
    labels: ["Backend", "Performance"],
    estimate: 8,
    project: PROJECT.claims,
    views: [VIEW.blocked, VIEW.sprint, VIEW.tables],
    description: body(
      "## Problem",
      "Exports over 50k rows hit the 30s gateway timeout and return a 504.",
      "",
      "## Page plan",
      "| Page | Rows | Cursor | Time budget | Retries | Owner | Notes |",
      "|------|-----:|--------|------------:|--------:|-------|-------|",
      "| 1 | 5,000 | `0` | 4s | 3 | Platform | **Warm** the cache |",
      "| 2 | 5,000 | `5000` | 4s | 3 | Platform | |",
      "| 3 | 5,000 | `10000` | 4s | 3 | Finance ops | *Largest month* |",
      "| 4 | 5,000 | `15000` | 4s | 3 | Finance ops | Retry on 503 |",
      "| 5 | 5,000 | `20000` | 4s | 3 | Platform | Signed URL at the end |",
      "",
      "## Approach",
      "- Stream the export in pages of 5k rows",
      "- Return a signed URL once the file is complete",
    ),
  },
  {
    number: 113,
    title: "Freeze the legacy PDF template for v1 reports",
    assignee: "Levente Szabo",
    labels: ["Tech debt"],
    project: PROJECT.docusense,
    views: [VIEW.techDebt],
    description: body(
      "## Why",
      "The v1 renderer reads a PDF template that nobody has changed since 2023.",
      "",
      "- Freeze the template file so the v1 output stops changing",
      "- Add a checksum test so accidental edits fail CI",
      "",
      "Must land before [retiring the v1 renderer](https://linear.app/marshmallow/issue/DEMO-110/retire-the-v1-report-renderer).",
    ),
  },
  {
    number: 114,
    title: "Publish claim amendment events from the claims service",
    assignee: "Marta Nagy",
    labels: ["Backend", "Events"],
    estimate: 2,
    project: PROJECT.docusense,
    views: [VIEW.blocked, VIEW.sprint, VIEW.tables],
    description: body(
      "## Context",
      "Claims service changes (amend, reopen, reissue) do not publish events, so downstream views go stale.",
      "",
      "## Done when",
      "- Each amendment writes one event with the claim ID and version",
      "- Events are replayed in order after a consumer restart",
      "- The schema is documented next to the other claim events",
      "",
      "Related: [report regeneration](https://linear.app/marshmallow/issue/DEMO-111/regenerate-report-sections-when-a-claim-is-amended) and the [event catalogue](https://docs.example.com/events/claims).",
    ),
  },
  {
    number: 115,
    title: "Push notification deep links open the wrong claim",
    assignee: "Dora Varga",
    labels: ["Mobile", "Bug"],
    estimate: 5,
    project: PROJECT.mobile,
    views: [VIEW.customers],
    description: body(
      "## Steps to reproduce",
      "1. Receive a push for claim CL-2231 while the app is backgrounded",
      "2. Tap the notification",
      "",
      "The app opens the most recently viewed claim instead of the one in the payload.",
      "",
      "> Seen on the iOS and Android builds from this week.",
    ),
  },
  {
    number: 120,
    title: "Warm the quote cache after each deploy",
    assignee: null,
    labels: ["Performance"],
    description: body(
      "## Summary",
      "Warm the quote cache after each deploy so the first motor quotes do not wait on the rating tables.",
    ),
  },
  {
    number: 201,
    title: "Extraction rules for empty report sections",
    assignee: "Bence Toth",
    labels: ["Docs"],
    description: body(
      "## Rules",
      "- An empty section needs a reason code: `NO_SOURCE`, `NOT_EXTRACTED` or `NOT_REQUIRED`",
      "- The section stays in the report with the reason shown",
      "",
      "Continue with the [suppressed section audit](https://linear.app/marshmallow/issue/DEMO-202/audit-trail-for-suppressed-report-sections).",
    ),
  },
  {
    number: 202,
    title: "Audit trail for suppressed report sections",
    assignee: null,
    labels: ["Backend", "Compliance"],
    description: body(
      "## Scope",
      "Every suppressed section is written to the audit table with the reason code and the user who suppressed it.",
      "",
      "Read the [retention rules](https://linear.app/marshmallow/issue/DEMO-203/retention-policy-for-generated-medical-reports) before adding columns.",
    ),
  },
  {
    number: 203,
    title: "Retention policy for generated medical reports",
    assignee: "Marta Nagy",
    labels: ["Compliance"],
    description: body(
      "## Policy",
      "Generated medical reports are kept for seven years, then deleted by the nightly job.",
      "",
      "Partner downloads are covered in [partner portal access](https://linear.app/marshmallow/issue/DEMO-205/partner-portal-access-for-report-downloads).",
    ),
  },
  {
    number: 204,
    title: "Partner list for the v1 renderer",
    assignee: null,
    labels: ["Docs"],
    description: body(
      "## Notes",
      "Eleven partners still download v1 PDFs. Their owners have been emailed, and the list is kept in the shared sheet.",
    ),
  },
  {
    number: 205,
    title: "Partner portal access for report downloads",
    assignee: "Dora Varga",
    labels: ["Backend"],
    description: body(
      "## Notes",
      "Download links expire after 15 minutes. Partners on the v1 template see a warning banner until they move.",
    ),
  },
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ticketId = (number: number): string => `demo-issue-${number}`;

const SEED_BY_ID = new Map(SEEDS.map((seed) => [ticketId(seed.number), seed] as const));

export const DEMO_TICKETS: Ticket[] = SEEDS.map((seed) => {
  const identifier = `DEMO-${seed.number}`;
  return {
    id: ticketId(seed.number),
    identifier,
    title: seed.title,
    description: seed.description,
    url: `https://linear.app/demo/issue/${identifier}/${slugify(seed.title)}`,
    teamId: DEMO_TEAM.id,
    teamKey: DEMO_TEAM.key,
    stateName: seed.state ?? "Todo",
    assignee: seed.assignee,
    labels: seed.labels,
    currentEstimate: seed.estimate ?? null,
    blockedBy: (seed.blockedBy ?? []).map(ticketId),
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

function searchSample(all: Ticket[], query: string): Ticket[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const idQuery = parseIdQuery(trimmed);
  const exact = identifiersFor(trimmed).flatMap((ref) => all.filter((ticket) => ticket.identifier === ref));
  const prefix = idQuery
    ? all
        .filter((ticket) => matchesIdQuery(ticket.identifier, idQuery))
        .sort((a, b) => issueNumber(a.identifier) - issueNumber(b.identifier))
    : [];
  const needle = trimmed.toLowerCase();
  const titled = all.filter((ticket) => ticket.title.toLowerCase().includes(needle));
  return mergeTickets([exact, prefix, titled], SEARCH_LIMIT);
}

function projectOf(ticketIdValue: string): string | undefined {
  return SEED_BY_ID.get(ticketIdValue)?.project;
}

function viewsOf(ticketIdValue: string): string[] {
  return SEED_BY_ID.get(ticketIdValue)?.views ?? [];
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
    async listProjects() {
      return DEMO_PROJECTS;
    },
    async listViews() {
      return DEMO_VIEWS;
    },
    async issuesFromView(viewId: string, cursor?: string) {
      const tickets = currentTickets().filter((ticket) => viewsOf(ticket.id).includes(viewId));
      return pageOf(tickets, cursor);
    },
    async issuesFromProject(projectId: string, options: ProjectIssueOptions, cursor?: string) {
      const tickets = currentTickets().filter(
        (ticket) =>
          projectOf(ticket.id) === projectId &&
          !CLOSED_STATES.includes(ticket.stateName) &&
          (!options.onlyUnestimated || (ticket.stateName === "Todo" && ticket.currentEstimate === null)),
      );
      return pageOf(tickets, cursor);
    },
    async issuesByRefs(refs: string[]) {
      return byRefs(refs);
    },
    async searchIssues(query: string) {
      return searchSample(currentTickets(), query);
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
