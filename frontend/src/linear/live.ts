import type { Estimate, Ticket } from "@shared/types";
import { createGraphqlClient, LinearAuthError, LinearError, type AuthProvider, type GraphqlClient } from "./client";
import { ISSUE_FIELDS, mapIssue, type IssueNode } from "./mapIssue";
import { getAccessToken } from "./oauth";
import {
  identifiersFor,
  issueNumber,
  mergeTickets,
  numberPrefixRanges,
  parseIdQuery,
  type IdQuery,
  type NumberRange,
} from "./searchPlan";
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

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<T> = { nodes: T[]; pageInfo: PageInfo };

type ProjectNode = {
  id: string;
  name: string;
  slugId: string;
  status: { name: string };
  teams: { nodes: { key: string }[] };
};

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

type FavoriteNode = {
  id: string;
  sortOrder: number;
  customView: { id: string } | null;
};

const FAVORITE_PAGE_LIMIT = 5;
const PROJECT_PAGE_LIMIT = 5;
const OPEN_STATE_TYPES = ["completed", "canceled"];

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

const FAVORITES_QUERY = `
  query Favorites($after: String) {
    favorites(first: 100, after: $after) {
      nodes { id sortOrder customView { id } }
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

const PROJECTS_QUERY = `
  query Projects($after: String) {
    projects(first: 100, after: $after) {
      nodes {
        id
        name
        slugId
        status { name }
        teams(first: 20) { nodes { key } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PROJECT_ISSUES_QUERY = `
  query ProjectIssues($filter: IssueFilter, $after: String) {
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

const NUMBER_PREFIX_QUERY = `
  query IssuesByNumber($filter: IssueFilter) {
    issues(filter: $filter, first: 50) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

const FULL_TEXT_QUERY = `
  query FullTextSearch($term: String!) {
    searchIssues(term: $term, first: 25) {
      nodes { id identifier }
    }
  }
`;

const ISSUES_BY_ID_QUERY = `
  query IssuesByIds($ids: [ID!]!) {
    issues(filter: { id: { in: $ids } }, first: 25) {
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

async function collectAll<T>(
  fetchPage: (after: string | null) => Promise<Connection<T>>,
  maxPages = Number.POSITIVE_INFINITY,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  let pages = 0;
  do {
    const page: Connection<T> = await fetchPage(after);
    all.push(...page.nodes);
    pages += 1;
    after = page.pageInfo.hasNextPage && pages < maxPages ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return all;
}

async function fetchFavoriteOrders(client: GraphqlClient): Promise<Map<string, number>> {
  const nodes = await collectAll<FavoriteNode>(async (after) => {
    const data = await client.query<{ favorites: Connection<FavoriteNode> }>(FAVORITES_QUERY, { after });
    return data.favorites;
  }, FAVORITE_PAGE_LIMIT);
  const orders = new Map<string, number>();
  for (const node of nodes) {
    if (node.customView && !orders.has(node.customView.id)) {
      orders.set(node.customView.id, node.sortOrder);
    }
  }
  return orders;
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

function toProject(node: ProjectNode): LinearProject {
  return {
    id: node.id,
    name: node.name,
    slugId: node.slugId,
    stateName: node.status.name,
    teamKeys: node.teams.nodes.map((team) => team.key),
  };
}

async function fetchProjects(client: GraphqlClient): Promise<LinearProject[]> {
  const nodes = await collectAll<ProjectNode>(async (after) => {
    const data = await client.query<{ projects: Connection<ProjectNode> }>(PROJECTS_QUERY, { after });
    return data.projects;
  }, PROJECT_PAGE_LIMIT);
  return nodes.map(toProject);
}

function projectIssueFilter(projectId: string, options: ProjectIssueOptions) {
  const project = { id: { eq: projectId } };
  const openState = { type: { nin: OPEN_STATE_TYPES } };
  if (!options.onlyUnestimated) {
    return { project, state: openState };
  }
  return {
    project,
    state: { ...openState, name: { eqIgnoreCase: "Todo" } },
    estimate: { null: true },
  };
}

function buildLiveService(auth: AuthProvider, fetchImpl: typeof fetch): LinearService {
  const client = createGraphqlClient(auth, fetchImpl);
  let teamsCache: Promise<LinearTeam[]> | null = null;
  let projectsCache: Promise<LinearProject[]> | null = null;

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

  function listProjects(): Promise<LinearProject[]> {
    if (projectsCache === null) {
      const pending = fetchProjects(client).catch((error: unknown) => {
        projectsCache = null;
        throw error;
      });
      projectsCache = pending;
    }
    return projectsCache;
  }

  async function findTeam(teamId: string): Promise<LinearTeam | undefined> {
    return (await listTeams()).find((team) => team.id === teamId);
  }

  async function getViewer(): Promise<Viewer> {
    const data = await client.query<{ viewer: Viewer }>(VIEWER_QUERY);
    return { id: data.viewer.id, name: data.viewer.name, email: data.viewer.email };
  }

  async function favoriteOrdersOrNone(): Promise<Map<string, number>> {
    try {
      return await fetchFavoriteOrders(client);
    } catch (error: unknown) {
      if (error instanceof LinearAuthError) throw error;
      return new Map();
    }
  }

  async function listViews(): Promise<LinearView[]> {
    const [views, favoriteOrders] = await Promise.all([
      collectAll<ViewNode>(async (after) => {
        const data = await client.query<{ customViews: Connection<ViewNode> }>(VIEWS_QUERY, { after });
        return data.customViews;
      }),
      favoriteOrdersOrNone(),
    ]);
    return views
      .filter((view) => view.modelName === "Issue")
      .map((view) => {
        const favoriteOrder = favoriteOrders.get(view.id) ?? null;
        return {
          id: view.id,
          name: view.name,
          description: view.description,
          shared: view.shared,
          teamKey: view.team?.key ?? null,
          favorite: favoriteOrder !== null,
          favoriteOrder,
        };
      });
  }

  async function issuesFromView(viewId: string, cursor?: string): Promise<IssuePage> {
    const data = await client.query<{ customView: { issues: Connection<IssueNode> } }>(VIEW_ISSUES_QUERY, {
      id: viewId,
      after: cursor ?? null,
    });
    return toPage(data.customView.issues);
  }

  async function issuesFromProject(
    projectId: string,
    options: ProjectIssueOptions,
    cursor?: string,
  ): Promise<IssuePage> {
    const data = await client.query<{ issues: Connection<IssueNode> }>(PROJECT_ISSUES_QUERY, {
      filter: projectIssueFilter(projectId, options),
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

  async function issuesByNumberPrefix(query: IdQuery, ranges: NumberRange[]): Promise<Ticket[]> {
    const teamClause: { team: { key: { eqIgnoreCase: string } } }[] =
      query.teamKey === null ? [] : [{ team: { key: { eqIgnoreCase: query.teamKey } } }];
    const filter = {
      and: [...teamClause, { or: ranges.map((range) => ({ number: { gte: range.gte, lte: range.lte } })) }],
    };
    const data = await client.query<{ issues: { nodes: IssueNode[] } }>(NUMBER_PREFIX_QUERY, { filter });
    return data.issues.nodes
      .slice()
      .sort((a, b) => issueNumber(a.identifier) - issueNumber(b.identifier))
      .map(mapIssue);
  }

  async function titleMatches(term: string): Promise<Ticket[]> {
    const data = await client.query<{ issues: { nodes: IssueNode[] } }>(SEARCH_QUERY, {
      filter: { title: { containsIgnoreCase: term } },
    });
    return data.issues.nodes.map(mapIssue);
  }

  async function fullTextMatches(term: string): Promise<Ticket[]> {
    const hits = await client.query<{ searchIssues: { nodes: { id: string }[] } }>(FULL_TEXT_QUERY, { term });
    const ids = hits.searchIssues.nodes.map((node) => node.id);
    if (ids.length === 0) return [];

    const data = await client.query<{ issues: { nodes: IssueNode[] } }>(ISSUES_BY_ID_QUERY, { ids });
    const byId = new Map(data.issues.nodes.map((node) => [node.id, node] as const));
    return ids.flatMap((id) => {
      const node = byId.get(id);
      return node ? [mapIssue(node)] : [];
    });
  }

  async function searchIssues(query: string): Promise<Ticket[]> {
    const trimmed = query.trim();
    if (trimmed === "") return [];

    const idQuery = parseIdQuery(trimmed);
    const ranges = idQuery ? numberPrefixRanges(idQuery.digits) : [];
    const refs = identifiersFor(trimmed);

    const tasks: Promise<Ticket[]>[] = [];
    if (refs.length > 0) tasks.push(issuesByRefs(refs).then((resolved) => resolved.tickets));
    if (idQuery && ranges.length > 0) tasks.push(issuesByNumberPrefix(idQuery, ranges));
    tasks.push(titleMatches(trimmed));
    tasks.push(fullTextMatches(trimmed));

    const settled = await Promise.allSettled(tasks);
    const failures: unknown[] = [];
    for (const result of settled) {
      if (result.status === "rejected") failures.push(result.reason);
    }
    const authFailure = failures.find((reason) => reason instanceof LinearAuthError);
    if (authFailure !== undefined) throw authFailure;
    if (failures.length === settled.length) throw failures[0];

    return mergeTickets(settled.map((result) => (result.status === "fulfilled" ? result.value : [])));
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
    listProjects,
    listViews,
    issuesFromView,
    issuesFromProject,
    issuesByRefs,
    searchIssues,
    checkEstimateScale,
    commitEstimate,
  };
}

export function createOAuthLiveService(fetchImpl: typeof fetch = fetch): LinearService {
  const provider: AuthProvider = {
    getHeader: async () => {
      const token = await getAccessToken(fetchImpl);
      return token ? `Bearer ${token}` : null;
    },
    refresh: async () => (await getAccessToken(fetchImpl, true)) !== null,
  };
  return buildLiveService(provider, fetchImpl);
}
