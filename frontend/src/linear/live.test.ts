import { describe, expect, it, vi } from "vitest";
import type { Ticket } from "@shared/types";
import { LinearError } from "./client";
import { createLiveService } from "./live";
import type { IssueNode } from "./mapIssue";

type Call = { query: string; variables: Record<string, unknown> };
type Reply = { data?: unknown; errors?: unknown[] };
type Responder = (call: Call) => Reply;

function scriptedFetch(respond: Responder) {
  const calls: Call[] = [];
  const fn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body)) as Call;
    calls.push(call);
    return new Response(JSON.stringify(respond(call)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

function issueNode(identifier: string, overrides: Partial<IssueNode> = {}): IssueNode {
  return {
    id: `id-${identifier}`,
    identifier,
    title: `Title ${identifier}`,
    description: null,
    url: `https://linear.app/x/issue/${identifier}/slug`,
    estimate: null,
    state: { name: "Todo" },
    assignee: null,
    labels: { nodes: [] },
    team: { id: "team-clfp", key: "CLFP" },
    ...overrides,
  };
}

function teamNode(id: string, estimationType: string, states: { id: string; name: string }[]) {
  return {
    id,
    key: id.toUpperCase(),
    name: `Team ${id}`,
    issueEstimationType: estimationType,
    issueEstimationExtended: false,
    issueEstimationAllowZero: false,
    states: { nodes: states.map((state) => ({ ...state, type: "started" })) },
  };
}

const FIBONACCI_TEAM = teamNode("team-clfp", "fibonacci", [
  { id: "state-todo", name: "Todo" },
  { id: "state-groomed", name: "Groomed" },
]);

function ticketFor(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "id-CLFP-1",
    identifier: "CLFP-1",
    title: "Title",
    description: "",
    url: "https://linear.app/x/issue/CLFP-1/slug",
    teamId: "team-clfp",
    teamKey: "CLFP",
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
    ...overrides,
  };
}

describe("listTeams", () => {
  it("detects the GROOMED state case-insensitively and caches the result", async () => {
    const mock = scriptedFetch(({ query }) => {
      if (query.includes("teams(")) {
        return {
          data: {
            teams: {
              nodes: [
                FIBONACCI_TEAM,
                teamNode("team-other", "exponential", [{ id: "state-todo", name: "Todo" }]),
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      return { errors: [{ message: "unexpected" }] };
    });
    const service = createLiveService("k", mock.fetch);

    const first = await service.listTeams();
    const second = await service.listTeams();

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      id: "team-clfp",
      key: "TEAM-CLFP",
      estimationType: "fibonacci",
      groomedStateId: "state-groomed",
    });
    expect(first[1]?.groomedStateId).toBeNull();
    expect(second).toBe(first);
    expect(mock.fn).toHaveBeenCalledTimes(1);
  });

  it("follows pagination cursors across team pages", async () => {
    const mock = scriptedFetch(({ variables }) => {
      if (variables.after === null || variables.after === undefined) {
        return {
          data: {
            teams: {
              nodes: [FIBONACCI_TEAM],
              pageInfo: { hasNextPage: true, endCursor: "page-2" },
            },
          },
        };
      }
      return {
        data: {
          teams: {
            nodes: [teamNode("team-two", "fibonacci", [])],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    });
    const service = createLiveService("k", mock.fetch);

    const teams = await service.listTeams();

    expect(teams.map((team) => team.id)).toEqual(["team-clfp", "team-two"]);
    expect(mock.calls[1]?.variables.after).toBe("page-2");
  });

  it("retries after a failed fetch instead of caching the failure", async () => {
    let attempt = 0;
    const mock = scriptedFetch(() => {
      attempt += 1;
      if (attempt === 1) return { errors: [{ message: "temporary" }] };
      return { data: { teams: { nodes: [FIBONACCI_TEAM], pageInfo: { hasNextPage: false, endCursor: null } } } };
    });
    const service = createLiveService("k", mock.fetch);

    await expect(service.listTeams()).rejects.toBeInstanceOf(LinearError);
    await expect(service.listTeams()).resolves.toHaveLength(1);
    expect(mock.fn).toHaveBeenCalledTimes(2);
  });
});

describe("checkEstimateScale", () => {
  function serviceWithTeams(teams: unknown[]) {
    const mock = scriptedFetch(() => ({
      data: { teams: { nodes: teams, pageInfo: { hasNextPage: false, endCursor: null } } },
    }));
    return createLiveService("k", mock.fetch);
  }

  it("reports a missing GROOMED status", async () => {
    const service = serviceWithTeams([teamNode("team-clfp", "fibonacci", [{ id: "s", name: "Todo" }])]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({
      ok: false,
      reason: "No GROOMED status found in this team",
    });
  });

  it("reports a non-Fibonacci estimate scale with its type", async () => {
    const service = serviceWithTeams([teamNode("team-clfp", "exponential", [{ id: "g", name: "Groomed" }])]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({
      ok: false,
      reason: "This team uses the exponential estimate scale; 1, 2, 3, 5 and 8 need the Fibonacci scale",
    });
  });

  it("passes when the team has GROOMED and a Fibonacci scale", async () => {
    const service = serviceWithTeams([FIBONACCI_TEAM]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({ ok: true, reason: null });
  });

  it("reports an unknown team instead of passing", async () => {
    const service = serviceWithTeams([FIBONACCI_TEAM]);
    const check = await service.checkEstimateScale("team-missing");
    expect(check.ok).toBe(false);
  });
});

describe("commitEstimate", () => {
  function commitService(teams: unknown[], success = true) {
    const mock = scriptedFetch(({ query }) => {
      if (query.includes("issueUpdate")) {
        return { data: { issueUpdate: { success } } };
      }
      return { data: { teams: { nodes: teams, pageInfo: { hasNextPage: false, endCursor: null } } } };
    });
    return { service: createLiveService("k", mock.fetch), mock };
  }

  it("sends the estimate with the groomed state id", async () => {
    const { service, mock } = commitService([FIBONACCI_TEAM]);

    await service.commitEstimate(ticketFor({ id: "issue-uuid", teamId: "team-clfp" }), 5);

    const mutation = mock.calls.find((call) => call.query.includes("issueUpdate"));
    expect(mutation?.variables).toEqual({ id: "issue-uuid", estimate: 5, stateId: "state-groomed" });
  });

  it("throws without sending a mutation when the scale check fails", async () => {
    const { service, mock } = commitService([teamNode("team-clfp", "exponential", [{ id: "g", name: "Groomed" }])]);

    await expect(service.commitEstimate(ticketFor(), 3)).rejects.toBeInstanceOf(LinearError);
    expect(mock.calls.some((call) => call.query.includes("issueUpdate"))).toBe(false);
  });

  it("throws when Linear reports success false", async () => {
    const { service } = commitService([FIBONACCI_TEAM], false);
    await expect(service.commitEstimate(ticketFor(), 3)).rejects.toBeInstanceOf(LinearError);
  });
});

describe("issue paging", () => {
  it("passes the cursor through and returns nextCursor for team issues", async () => {
    const mock = scriptedFetch(({ variables }) => {
      if (variables.after === "cursor-1") {
        return {
          data: { issues: { nodes: [issueNode("CLFP-2")], pageInfo: { hasNextPage: false, endCursor: null } } },
        };
      }
      return {
        data: {
          issues: { nodes: [issueNode("CLFP-1")], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        },
      };
    });
    const service = createLiveService("k", mock.fetch);

    const first = await service.issuesFromTeam("team-clfp");
    expect(first.nextCursor).toBe("cursor-1");
    expect(first.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-1"]);

    const second = await service.issuesFromTeam("team-clfp", first.nextCursor ?? undefined);
    expect(second.nextCursor).toBeNull();
    expect(second.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-2"]);
    expect(mock.calls[1]?.variables.after).toBe("cursor-1");
  });

  it("filters team issues to Todo without an estimate", async () => {
    const mock = scriptedFetch(() => ({
      data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    }));
    const service = createLiveService("k", mock.fetch);

    await service.issuesFromTeam("team-clfp");

    expect(mock.calls[0]?.variables.filter).toEqual({
      team: { id: { eq: "team-clfp" } },
      state: { name: { eqIgnoreCase: "Todo" } },
      estimate: { null: true },
    });
  });

  it("reads view issues through customView and passes the cursor", async () => {
    const mock = scriptedFetch(() => ({
      data: {
        customView: {
          issues: { nodes: [issueNode("CLFP-9")], pageInfo: { hasNextPage: true, endCursor: "next" } },
        },
      },
    }));
    const service = createLiveService("k", mock.fetch);

    const page = await service.issuesFromView("view-1", "start");

    expect(mock.calls[0]?.variables).toEqual({ id: "view-1", after: "start" });
    expect(page.nextCursor).toBe("next");
  });
});

describe("issuesByRefs", () => {
  it("resolves refs in one batched query and reports the ones that were not found", async () => {
    const mock = scriptedFetch(() => ({
      data: {
        r0: issueNode("CLFP-123"),
        r1: null,
      },
      errors: [{ message: "Entity not found: Issue", path: ["r1"] }],
    }));
    const service = createLiveService("k", mock.fetch);

    const result = await service.issuesByRefs(["CLFP-123", "NOPE-999"]);

    expect(mock.fn).toHaveBeenCalledTimes(1);
    expect(mock.calls[0]?.query).toContain("r0: issue(id: $r0)");
    expect(mock.calls[0]?.query).toContain("r1: issue(id: $r1)");
    expect(mock.calls[0]?.variables).toEqual({ r0: "CLFP-123", r1: "NOPE-999" });
    expect(result.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-123"]);
    expect(result.notFound).toEqual(["NOPE-999"]);
  });

  it("does not call Linear when there is nothing to resolve", async () => {
    const mock = scriptedFetch(() => ({ data: {} }));
    const service = createLiveService("k", mock.fetch);

    await expect(service.issuesByRefs([])).resolves.toEqual({ tickets: [], notFound: [] });
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it("routes free text with identifiers through issuesByRefs in searchIssues", async () => {
    const mock = scriptedFetch(() => ({ data: { r0: issueNode("ENG-7") } }));
    const service = createLiveService("k", mock.fetch);

    const tickets = await service.searchIssues("see eng-7");

    expect(mock.calls[0]?.variables).toEqual({ r0: "ENG-7" });
    expect(tickets.map((ticket) => ticket.identifier)).toEqual(["ENG-7"]);
  });

  it("searches titles when there are no identifiers", async () => {
    const mock = scriptedFetch(() => ({ data: { issues: { nodes: [issueNode("CLFP-4")] } } }));
    const service = createLiveService("k", mock.fetch);

    await service.searchIssues("  webhook retry ");

    expect(mock.calls[0]?.variables).toEqual({ filter: { title: { containsIgnoreCase: "webhook retry" } } });
  });
});
