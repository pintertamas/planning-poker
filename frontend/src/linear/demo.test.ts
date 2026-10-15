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
