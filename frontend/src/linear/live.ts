import type { Estimate, Ticket } from "@shared/types";
import { createGraphqlClient, LinearError, type GraphqlClient } from "./client";
import { ISSUE_FIELDS, mapIssue, type IssueNode } from "./mapIssue";
import { parseRefs } from "./parseRefs";
import type { IssuePage, LinearService, LinearTeam, LinearView, ScaleCheck, Viewer } from "./types";

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<T> = { nodes: T[]; pageInfo: PageInfo };

type TeamNode = {
  id: string;
  key: string;
  name: string;
  issueEstimationType: string;
  issueEstimationExtended: boolean;
  issueEstimationAllowZero: boolean;
  states: { nodes: { id: string; name: string; type: string }[] };
};

type ViewNode = {
  id: string;
  name: string;
  description: string | null;
  shared: boolean;
  modelName: string;
  team: { key: string } | null;
};

const VIEWER_QUERY = `
  query Viewer {
    viewer { id name email }
  }
`;

const TEAMS_QUERY = `
  query Teams($after: String) {
    teams(first: 50, after: $after) {
      nodes {
        id
        key
        name
        issueEstimationType
        issueEstimationExtended
        issueEstimationAllowZero
        states(first: 50) { nodes { id name type } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const VIEWS_QUERY = `
  query CustomViews($after: String) {
    customViews(first: 50, after: $after) {
      nodes { id name description shared modelName team { key } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const VIEW_ISSUES_QUERY = `
  query ViewIssues($id: String!, $after: String) {
    customView(id: $id) {
      issues(first: 50, after: $after) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const TEAM_ISSUES_QUERY = `
  query TeamIssues($filter: IssueFilter, $after: String) {
    issues(filter: $filter, first: 50, after: $after) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const SEARCH_QUERY = `
  query SearchIssues($filter: IssueFilter) {
    issues(filter: $filter, first: 25) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

const SET_ESTIMATE_MUTATION = `
  mutation SetEstimate($id: String!, $estimate: Int, $stateId: String) {
    issueUpdate(id: $id, input: { estimate: $estimate, stateId: $stateId }) {
      success
    }
  }
`;

function refsQuery(count: number): string {
  const variables = Array.from({ length: count }, (_, i) => `$r${i}: String!`).join(", ");
  const aliases = Array.from(
    { length: count },
    (_, i) => `r${i}: issue(id: $r${i}) { ${ISSUE_FIELDS} }`,
  ).join("\n");
  return `query IssuesByRef(${variables}) {\n${aliases}\n}`;
}

async function collectAll<T>(fetchPage: (after: string | null) => Promise<Connection<T>>): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  do {
    const page: Connection<T> = await fetchPage(after);
    all.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return all;
}

function toPage(connection: Connection<IssueNode>): IssuePage {
  return {
    tickets: connection.nodes.map(mapIssue),
    nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
  };
}

function toTeam(node: TeamNode): LinearTeam {
  const groomed = node.states.nodes.find((state) => state.name.toLowerCase() === "groomed");
  return {
    id: node.id,
    key: node.key,
    name: node.name,
    estimationType: node.issueEstimationType,
    estimationExtended: node.issueEstimationExtended,
    estimationAllowZero: node.issueEstimationAllowZero,
    groomedStateId: groomed?.id ?? null,
  };
}

async function fetchTeams(client: GraphqlClient): Promise<LinearTeam[]> {
  const nodes = await collectAll<TeamNode>(async (after) => {
    const data = await client.query<{ teams: Connection<TeamNode> }>(TEAMS_QUERY, { after });
    return data.teams;
  });
  return nodes.map(toTeam);
}

export function createLiveService(apiKey: string, fetchImpl: typeof fetch = fetch): LinearService {
  const client = createGraphqlClient(apiKey, fetchImpl);
  let teamsCache: Promise<LinearTeam[]> | null = null;

  function listTeams(): Promise<LinearTeam[]> {
    if (teamsCache === null) {
      const pending = fetchTeams(client).catch((error: unknown) => {
        teamsCache = null;
        throw error;
      });
      teamsCache = pending;
    }
    return teamsCache;
  }

  async function findTeam(teamId: string): Promise<LinearTeam | undefined> {
    return (await listTeams()).find((team) => team.id === teamId);
  }

  async function getViewer(): Promise<Viewer> {
    const data = await client.query<{ viewer: Viewer }>(VIEWER_QUERY);
    return { id: data.viewer.id, name: data.viewer.name, email: data.viewer.email };
  }

  async function listViews(): Promise<LinearView[]> {
    const views = await collectAll<ViewNode>(async (after) => {
      const data = await client.query<{ customViews: Connection<ViewNode> }>(VIEWS_QUERY, { after });
      return data.customViews;
    });
    return views
      .filter((view) => view.modelName === "Issue")
      .map((view) => ({
        id: view.id,
        name: view.name,
        description: view.description,
        shared: view.shared,
        teamKey: view.team?.key ?? null,
      }));
  }

  async function issuesFromView(viewId: string, cursor?: string): Promise<IssuePage> {
    const data = await client.query<{ customView: { issues: Connection<IssueNode> } }>(VIEW_ISSUES_QUERY, {
      id: viewId,
      after: cursor ?? null,
    });
    return toPage(data.customView.issues);
  }

  async function issuesFromTeam(teamId: string, cursor?: string): Promise<IssuePage> {
    const data = await client.query<{ issues: Connection<IssueNode> }>(TEAM_ISSUES_QUERY, {
      filter: {
        team: { id: { eq: teamId } },
        state: { name: { eqIgnoreCase: "Todo" } },
        estimate: { null: true },
      },
      after: cursor ?? null,
    });
    return toPage(data.issues);
  }

  async function issuesByRefs(refs: string[]): Promise<{ tickets: Ticket[]; notFound: string[] }> {
    const unique = [...new Set(refs)];
    if (unique.length === 0) return { tickets: [], notFound: [] };

    const variables = Object.fromEntries(unique.map((ref, i) => [`r${i}`, ref]));
    const result = await client.queryPartial<Record<string, IssueNode | null>>(refsQuery(unique.length), variables);

    const tickets: Ticket[] = [];
    const notFound: string[] = [];
    unique.forEach((ref, i) => {
      const node = result.data?.[`r${i}`] ?? null;
      if (node) {
        tickets.push(mapIssue(node));
      } else {
        notFound.push(ref);
      }
    });
    return { tickets, notFound };
  }

  async function searchIssues(query: string): Promise<Ticket[]> {
    const trimmed = query.trim();
    if (trimmed === "") return [];

    const refs = parseRefs(trimmed);
    if (refs.length > 0) {
      const resolved = await issuesByRefs(refs);
      return resolved.tickets;
    }

    const data = await client.query<{ issues: { nodes: IssueNode[] } }>(SEARCH_QUERY, {
      filter: { title: { containsIgnoreCase: trimmed } },
    });
    return data.issues.nodes.map(mapIssue);
  }

  async function checkEstimateScale(teamId: string): Promise<ScaleCheck> {
    const team = await findTeam(teamId);
    if (!team) {
      return { ok: false, reason: "This team was not found in your Linear workspace" };
    }
    if (team.groomedStateId === null) {
      return { ok: false, reason: "No GROOMED status found in this team" };
    }
    if (team.estimationType !== "fibonacci") {
      return {
        ok: false,
        reason: `This team uses the ${team.estimationType} estimate scale; 1, 2, 3, 5 and 8 need the Fibonacci scale`,
      };
    }
    return { ok: true, reason: null };
  }

  async function commitEstimate(ticket: Ticket, estimate: Estimate): Promise<void> {
    const check = await checkEstimateScale(ticket.teamId);
    if (!check.ok) throw new LinearError(check.reason ?? "This team cannot store estimates");

    const team = await findTeam(ticket.teamId);
    if (!team || team.groomedStateId === null) {
      throw new LinearError("No GROOMED status found in this team");
    }

    const data = await client.query<{ issueUpdate: { success: boolean } }>(SET_ESTIMATE_MUTATION, {
      id: ticket.id,
      estimate,
      stateId: team.groomedStateId,
    });
    if (!data.issueUpdate.success) throw new LinearError("Linear did not accept the estimate");
  }

  return {
    mode: "live",
    getViewer,
    listTeams,
    listViews,
    issuesFromView,
    issuesFromTeam,
    issuesByRefs,
    searchIssues,
    checkEstimateScale,
    commitEstimate,
  };
}
