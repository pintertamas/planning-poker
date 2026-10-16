import { describe, expect, it } from "vitest";
import { createDemoService } from "./demo";

describe("demo service", () => {
  it("pages through the sample tickets five at a time", async () => {
    const service = createDemoService();

    const first = await service.issuesFromTeam("demo-team");
    expect(first.tickets).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.issuesFromView("demo-view-ready", first.nextCursor ?? undefined);
    expect(second.tickets[0]?.identifier).toBe("DEMO-106");

    let cursor: string | null = second.nextCursor;
    let total = first.tickets.length + second.tickets.length;
    while (cursor) {
      const page = await service.issuesFromView("demo-view-sprint", cursor);
      total += page.tickets.length;
      cursor = page.nextCursor;
    }
    expect(total).toBe(12);
  });

  it("offers shared and personal sample views with two favourites in sidebar order", async () => {
    const views = await createDemoService().listViews();

    const favorites = views
      .filter((view) => view.favorite)
      .sort((a, b) => (a.favoriteOrder ?? 0) - (b.favoriteOrder ?? 0));
    expect(favorites.map((view) => [view.name, view.favoriteOrder])).toEqual([
      ["Sprint backlog", 1],
      ["Ready for grooming", 2],
    ]);
    expect(views.filter((view) => !view.favorite).every((view) => view.favoriteOrder === null)).toBe(true);
    expect(views.some((view) => view.shared)).toBe(true);
    expect(views.some((view) => !view.shared)).toBe(true);
    expect(new Set(views.map((view) => view.id)).size).toBe(views.length);
  });

  it("resolves known refs and reports unknown ones", async () => {
    const service = createDemoService();
    const result = await service.issuesByRefs(["DEMO-103", "DEMO-999"]);
    expect(result.tickets.map((ticket) => ticket.identifier)).toEqual(["DEMO-103"]);
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
    await expect(identifiers("DEMO-11")).resolves.toEqual(["DEMO-110", "DEMO-111", "DEMO-112"]);
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

  it("passes the scale check for its demo team", async () => {
    const service = createDemoService();
    await expect(service.checkEstimateScale("demo-team")).resolves.toEqual({ ok: true, reason: null });
    expect(service.mode).toBe("demo");
  });
});
