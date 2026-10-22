import { describe, expect, it } from "vitest";
import { mapIssue, type IssueNode } from "./mapIssue";

function node(overrides: Partial<IssueNode> = {}): IssueNode {
  return {
    id: "issue-1",
    identifier: "CLFP-1",
    title: "Title",
    description: "Body",
    url: "https://linear.app/marshmallow/issue/CLFP-1/title",
    estimate: 3,
    state: { name: "Todo" },
    assignee: { name: "Anna" },
    labels: { nodes: [{ name: "Backend" }, { name: "Bug" }] },
    team: { id: "team-1", key: "CLFP" },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

describe("mapIssue", () => {
  it("maps a fully populated issue onto a Ticket", () => {
    expect(mapIssue(node())).toEqual({
      id: "issue-1",
      identifier: "CLFP-1",
      title: "Title",
      description: "Body",
      url: "https://linear.app/marshmallow/issue/CLFP-1/title",
      teamId: "team-1",
      teamKey: "CLFP",
      stateName: "Todo",
      assignee: "Anna",
      labels: ["Backend", "Bug"],
      currentEstimate: 3,
      blockedBy: [],
    });
  });

  it("turns a null description into an empty string", () => {
    expect(mapIssue(node({ description: null })).description).toBe("");
  });

  it("maps a missing assignee and estimate to null", () => {
    const ticket = mapIssue(node({ assignee: null, estimate: null }));
    expect(ticket.assignee).toBeNull();
    expect(ticket.currentEstimate).toBeNull();
  });

  it("keeps an estimate of zero", () => {
    expect(mapIssue(node({ estimate: 0 })).currentEstimate).toBe(0);
  });

  it("returns an empty label list when there are no labels", () => {
    expect(mapIssue(node({ labels: { nodes: [] } })).labels).toEqual([]);
  });

  it("maps only blocking inverse relations onto blockedBy", () => {
    const ticket = mapIssue(
      node({
        inverseRelations: {
          nodes: [
            { type: "blocks", issue: { id: "blocker-1" } },
            { type: "related", issue: { id: "related-1" } },
            { type: "duplicate", issue: { id: "duplicate-1" } },
            { type: "blocks", issue: { id: "blocker-2" } },
          ],
        },
      }),
    );
    expect(ticket.blockedBy).toEqual(["blocker-1", "blocker-2"]);
  });
});
