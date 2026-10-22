import { describe, expect, it } from "vitest";
import { createDemoService, DEMO_TICKETS } from "./demo";
import type { LinearService } from "./types";
import { parseBlocks, type Block } from "../features/tickets/markdown";
import { extractIssueIdentifiers } from "../features/tickets/issueLinks";

const VIEW_IDS = {
  sprint: "demo-view-sprint",
  ready: "demo-view-ready",
  blocked: "demo-view-blocked",
  tables: "demo-view-tables",
  techDebt: "demo-view-tech-debt",
  customers: "demo-view-customers",
};

const VIEW_TICKET_NUMBERS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
const REFERENCE_NUMBERS = [120, 201, 202, 203, 204, 205];

async function identifiersOf(service: LinearService, viewId: string): Promise<string[]> {
  const identifiers: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.issuesFromView(viewId, cursor);
    identifiers.push(...page.tickets.map((ticket) => ticket.identifier));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return identifiers;
}

async function projectIdentifiers(service: LinearService, projectId: string, onlyUnestimated: boolean): Promise<string[]> {
  const identifiers: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.issuesFromProject(projectId, { onlyUnestimated }, cursor);
    identifiers.push(...page.tickets.map((ticket) => ticket.identifier));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return identifiers;
}

function blockTypes(blocks: Block[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type !== "quote") return [block.type];
    return [block.type, ...blockTypes(block.blocks)];
  });
}

function byIdentifier(identifier: string) {
  const ticket = DEMO_TICKETS.find((item) => item.identifier === identifier);
  if (!ticket) throw new Error(`missing ${identifier}`);
  return ticket;
}

describe("demo service", () => {
  it("pages each view five at a time and reports every ticket once", async () => {
    const service = createDemoService();

    const first = await service.issuesFromView(VIEW_IDS.ready);
    expect(first.tickets.map((ticket) => ticket.identifier)).toEqual([
      "DEMO-101",
      "DEMO-102",
      "DEMO-104",
      "DEMO-105",
      "DEMO-106",
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.issuesFromView(VIEW_IDS.ready, first.nextCursor ?? undefined);
    expect(second.tickets.map((ticket) => ticket.identifier)).toEqual(["DEMO-107", "DEMO-108"]);
    expect(second.nextCursor).toBeNull();

    expect(await identifiersOf(service, VIEW_IDS.sprint)).toEqual([
      "DEMO-101",
      "DEMO-103",
      "DEMO-109",
      "DEMO-110",
      "DEMO-111",
      "DEMO-112",
      "DEMO-114",
    ]);
  });

  it("offers six sample views with two favourites in sidebar order", async () => {
    const views = await createDemoService().listViews();

    const favorites = views
      .filter((view) => view.favorite)
      .sort((a, b) => (a.favoriteOrder ?? 0) - (b.favoriteOrder ?? 0));
    expect(favorites.map((view) => [view.name, view.favoriteOrder])).toEqual([
      ["Sprint backlog", 1],
      ["Ready for grooming", 2],
    ]);
    expect(views.map((view) => view.name).sort()).toEqual(
      [
        "Blocked work",
        "Customer requests",
        "Ready for grooming",
        "Sprint backlog",
        "Tables and links showcase",
        "Tech debt",
      ].sort(),
    );
    expect(views.filter((view) => !view.favorite).every((view) => view.favoriteOrder === null)).toBe(true);
    expect(views.some((view) => view.shared)).toBe(true);
    expect(views.some((view) => !view.shared)).toBe(true);
    expect(new Set(views.map((view) => view.id)).size).toBe(views.length);
  });

  it("gives every view a different set of tickets and every room ticket at least one view", async () => {
    const service = createDemoService();
    const views = await service.listViews();
    const memberships = new Map<string, string[]>();
    for (const view of views) {
      memberships.set(view.name, await identifiersOf(service, view.id));
    }

    expect(memberships.get("Blocked work")).toHaveLength(9);
    expect(memberships.get("Tech debt")).toEqual(["DEMO-105", "DEMO-110", "DEMO-113"]);
    expect(memberships.get("Customer requests")).toEqual(["DEMO-102", "DEMO-103", "DEMO-115"]);

    const inAnyView = new Set([...memberships.values()].flat());
    expect([...inAnyView].sort()).toEqual(VIEW_TICKET_NUMBERS.map((number) => `DEMO-${number}`));
  });

  it("keeps reference tickets out of every view and project", async () => {
    const service = createDemoService();
    const views = await service.listViews();
    const projects = await service.listProjects();
    const listed = new Set<string>();
    for (const view of views) {
      for (const identifier of await identifiersOf(service, view.id)) listed.add(identifier);
    }
    for (const project of projects) {
      for (const identifier of await projectIdentifiers(service, project.id, false)) listed.add(identifier);
    }

    for (const number of REFERENCE_NUMBERS) {
      expect(listed.has(`DEMO-${number}`)).toBe(false);
    }
  });

  it("resolves known refs, including reference-only tickets, and reports unknown ones", async () => {
    const service = createDemoService();
    const result = await service.issuesByRefs(["DEMO-103", "DEMO-201", "DEMO-999"]);
    expect(result.tickets.map((ticket) => ticket.identifier)).toEqual(["DEMO-103", "DEMO-201"]);
    expect(result.notFound).toEqual(["DEMO-999"]);
  });

  it("searches sample titles case-insensitively", async () => {
    const service = createDemoService();
    const tickets = await service.searchIssues("WEBHOOK");
    expect(tickets.map((ticket) => ticket.identifier)).toEqual(["DEMO-101"]);
  });

  it("matches partial ticket IDs with or without the team key and a hash", async () => {
    const service = createDemoService();
    const tens = Array.from({ length: 9 }, (_, i) => `DEMO-${101 + i}`);
    const identifiers = async (query: string) =>
      (await service.searchIssues(query)).map((ticket) => ticket.identifier);

    await expect(identifiers("DEMO-10")).resolves.toEqual(tens);
    await expect(identifiers("demo10")).resolves.toEqual(tens);
    await expect(identifiers("10")).resolves.toEqual(tens);
    await expect(identifiers("#10")).resolves.toEqual(tens);
    await expect(identifiers("#103")).resolves.toEqual(["DEMO-103"]);
    await expect(identifiers("DEMO-11")).resolves.toEqual([
      "DEMO-110",
      "DEMO-111",
      "DEMO-112",
      "DEMO-113",
      "DEMO-114",
      "DEMO-115",
    ]);
    await expect(identifiers("12")).resolves.toEqual(["DEMO-120"]);
    await expect(identifiers("DEMO-20")).resolves.toEqual(["DEMO-201", "DEMO-202", "DEMO-203", "DEMO-204", "DEMO-205"]);
    await expect(identifiers("DEMO-999")).resolves.toEqual([]);
  });

  it("accepts an estimate and reflects it on the next read", async () => {
    const service = createDemoService();
    const [ticket] = (await service.issuesByRefs(["DEMO-102"])).tickets;
    expect(ticket).toBeDefined();
    if (!ticket) return;

    await service.commitEstimate(ticket, 3);

    const [updated] = (await service.issuesByRefs(["DEMO-102"])).tickets;
    expect(updated?.currentEstimate).toBe(3);
  });

  it("offers four sample projects with 12 character slug ids", async () => {
    const projects = await createDemoService().listProjects();

    expect(projects.map((project) => project.name)).toEqual([
      "Payment Improvements",
      "Docusense for medical report",
      "Claims Finance Reporting",
      "Mobile polish",
    ]);
    expect(projects.every((project) => /^[0-9a-f]{12}$/.test(project.slugId))).toBe(true);
    expect(projects.every((project) => project.teamKeys.length > 0 && project.stateName !== "")).toBe(true);
    expect(new Set(projects.map((project) => project.slugId)).size).toBe(projects.length);
    expect(projects.find((project) => project.slugId === "5aacc6eaba64")?.name).toBe(
      "Docusense for medical report",
    );
  });

  it("gives each project a different list with and without the Todo-without-estimate switch", async () => {
    const service = createDemoService();

    await expect(projectIdentifiers(service, "demo-project-payments", true)).resolves.toEqual(["DEMO-101"]);
    await expect(projectIdentifiers(service, "demo-project-payments", false)).resolves.toEqual([
      "DEMO-101",
      "DEMO-103",
      "DEMO-109",
    ]);
    await expect(projectIdentifiers(service, "demo-project-claims-finance", true)).resolves.toEqual(["DEMO-105"]);
    await expect(projectIdentifiers(service, "demo-project-claims-finance", false)).resolves.toEqual([
      "DEMO-105",
      "DEMO-112",
    ]);
    await expect(projectIdentifiers(service, "demo-project-mobile", true)).resolves.toEqual(["DEMO-102"]);
    await expect(projectIdentifiers(service, "demo-project-mobile", false)).resolves.toEqual(["DEMO-102", "DEMO-115"]);
    await expect(projectIdentifiers(service, "demo-project-docusense", true)).resolves.toEqual([
      "DEMO-107",
      "DEMO-108",
      "DEMO-113",
    ]);
    await expect(projectIdentifiers(service, "demo-project-unknown", false)).resolves.toEqual([]);
  });

  it("pages project issues five at a time so the list can load more", async () => {
    const service = createDemoService();

    const first = await service.issuesFromProject("demo-project-docusense", { onlyUnestimated: false });
    expect(first.tickets).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.issuesFromProject(
      "demo-project-docusense",
      { onlyUnestimated: false },
      first.nextCursor ?? undefined,
    );
    expect(second.tickets.map((ticket) => ticket.identifier)).toEqual(["DEMO-114"]);
    expect(second.nextCursor).toBeNull();
  });

  it("passes the scale check for its demo team", async () => {
    const service = createDemoService();
    await expect(service.checkEstimateScale("demo-team")).resolves.toEqual({ ok: true, reason: null });
    expect(service.mode).toBe("demo");
  });

  it("has a mix of assignees, estimates and states across the room tickets", () => {
    const roomTickets = DEMO_TICKETS.filter((ticket) => VIEW_TICKET_NUMBERS.includes(Number(ticket.identifier.slice(5))));
    expect(roomTickets).toHaveLength(15);
    expect(roomTickets.filter((ticket) => ticket.assignee === null).length).toBeGreaterThan(0);
    expect(roomTickets.filter((ticket) => ticket.currentEstimate !== null).length).toBeGreaterThan(0);
    expect(roomTickets.filter((ticket) => ticket.currentEstimate === null).length).toBeGreaterThan(
      roomTickets.length / 2,
    );
    expect(new Set(roomTickets.map((ticket) => ticket.stateName))).toEqual(new Set(["Todo", "In Progress"]));
  });
});

describe("demo dependency graph", () => {
  it("only references blockers that exist in the demo data", () => {
    const ids = new Set(DEMO_TICKETS.map((ticket) => ticket.id));
    for (const ticket of DEMO_TICKETS) {
      for (const blocker of ticket.blockedBy) {
        expect(ids.has(blocker), `${ticket.identifier} blocked by ${blocker}`).toBe(true);
        expect(blocker).not.toBe(ticket.id);
      }
    }
  });

  it("has no cycles", () => {
    const blockers = new Map(DEMO_TICKETS.map((ticket) => [ticket.id, ticket.blockedBy] as const));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`cycle through ${id}`);
      visiting.add(id);
      for (const next of blockers.get(id) ?? []) visit(next);
      visiting.delete(id);
      done.add(id);
    };
    for (const ticket of DEMO_TICKETS) visit(ticket.id);
    expect(done.size).toBe(DEMO_TICKETS.length);
  });

  it("has a blocker chain whose blocker has a higher number than the dependent", () => {
    const adjacent = byIdentifier("DEMO-108");
    const middle = byIdentifier("DEMO-111");
    const last = byIdentifier("DEMO-114");
    expect(adjacent.blockedBy).toEqual([middle.id]);
    expect(middle.blockedBy).toEqual([last.id]);
    expect(Number(last.identifier.slice(5))).toBeGreaterThan(Number(adjacent.identifier.slice(5)));
  });

  it("has one blocker that holds two tickets back", () => {
    const dependents = DEMO_TICKETS.filter((ticket) => ticket.blockedBy.includes(byIdentifier("DEMO-112").id));
    expect(dependents.map((ticket) => ticket.identifier)).toEqual(["DEMO-105", "DEMO-106"]);
  });

  it("has a blocker outside the Blocked work view that only shows once imported", async () => {
    const service = createDemoService();
    const blockedWork = await identifiersOf(service, "demo-view-blocked");
    const blocker = byIdentifier("DEMO-113");
    expect(blocker.identifier).toBe("DEMO-113");
    expect(blockedWork).not.toContain("DEMO-113");
    expect(blockedWork).toContain("DEMO-110");
    expect(byIdentifier("DEMO-110").blockedBy).toEqual([blocker.id]);
  });

  it("keeps independent tickets with no blockers in the Blocked work view", () => {
    expect(byIdentifier("DEMO-102").blockedBy).toEqual([]);
    expect(byIdentifier("DEMO-104").blockedBy).toEqual([]);
  });
});

describe("demo links and markdown", () => {
  it("resolves every linked identifier through issuesByRefs except the deliberate unknown DEMO-999", async () => {
    const service = createDemoService();
    const linked = new Set<string>();
    for (const ticket of DEMO_TICKETS) {
      for (const identifier of extractIssueIdentifiers(ticket.description)) linked.add(identifier);
    }

    expect(linked.has("DEMO-999")).toBe(true);
    const result = await service.issuesByRefs([...linked]);
    expect(result.notFound).toEqual(["DEMO-999"]);
    expect(result.tickets.map((ticket) => ticket.identifier).sort()).toEqual(
      [...linked].filter((identifier) => identifier !== "DEMO-999").sort(),
    );
  });

  it("links room tickets to reference-only tickets and to each other", () => {
    const linksOf = (identifier: string) => extractIssueIdentifiers(byIdentifier(identifier).description);
    expect(linksOf("DEMO-108")).toEqual(expect.arrayContaining(["DEMO-111", "DEMO-201"]));
    expect(linksOf("DEMO-114")).toEqual(expect.arrayContaining(["DEMO-111"]));
    expect(linksOf("DEMO-110")).toEqual(expect.arrayContaining(["DEMO-113", "DEMO-204", "DEMO-999"]));
  });

  it("walks a chain of at least three reference tickets", () => {
    const seen: string[] = [];
    let current: string | undefined = "DEMO-201";
    while (current !== undefined) {
      seen.push(current);
      const next: string | undefined = extractIssueIdentifiers(byIdentifier(current).description).find(
        (identifier) => identifier !== current && !seen.includes(identifier),
      );
      current = next;
    }
    expect(seen.slice(0, 3)).toEqual(["DEMO-201", "DEMO-202", "DEMO-203"]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const identifier of seen) {
      expect(DEMO_TICKETS.find((ticket) => ticket.identifier === identifier)?.description).toBeTruthy();
    }
  });

  it("parses the table descriptions into table blocks, including alignment and inline cells", () => {
    const aligned = parseBlocks(byIdentifier("DEMO-107").description).find((block) => block.type === "table");
    expect(aligned).toBeDefined();
    if (aligned?.type !== "table") return;
    expect(aligned.align).toEqual(["left", "center", "right", "left"]);
    expect(aligned.header).toHaveLength(4);
    expect(aligned.rows.length).toBeGreaterThanOrEqual(4);
    expect(aligned.rows[0]?.[0]).toBe("`patient_dob`");
    expect(aligned.rows[0]?.[2]).toBe("**Yes**");

    const wide = parseBlocks(byIdentifier("DEMO-112").description).find((block) => block.type === "table");
    expect(wide?.type === "table" && wide.header.length).toBe(7);
  });

  it("uses headings, both list kinds, code, quotes and tables across the descriptions", () => {
    const types = new Set(DEMO_TICKETS.flatMap((ticket) => blockTypes(parseBlocks(ticket.description))));
    for (const type of ["heading", "paragraph", "list", "code", "quote", "table"]) {
      expect(types.has(type), type).toBe(true);
    }
    const lists = DEMO_TICKETS.flatMap((ticket) => parseBlocks(ticket.description)).filter(
      (block) => block.type === "list",
    );
    expect(lists.some((block) => block.type === "list" && block.ordered)).toBe(true);
    expect(lists.some((block) => block.type === "list" && !block.ordered)).toBe(true);
  });
});
