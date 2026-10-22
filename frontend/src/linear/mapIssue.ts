import type { Ticket } from "@shared/types";

export const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  estimate
  state { name }
  assignee { name }
  labels { nodes { name } }
  team { id key }
  inverseRelations(first: 25) { nodes { type issue { id } } }
`;

export type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  estimate: number | null;
  state: { name: string };
  assignee: { name: string } | null;
  labels: { nodes: { name: string }[] };
  team: { id: string; key: string };
  inverseRelations: { nodes: { type: string; issue: { id: string } }[] };
};

export function mapIssue(node: IssueNode): Ticket {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? "",
    url: node.url,
    teamId: node.team.id,
    teamKey: node.team.key,
    stateName: node.state.name,
    assignee: node.assignee?.name ?? null,
    labels: node.labels.nodes.map((label) => label.name),
    currentEstimate: node.estimate ?? null,
    blockedBy: node.inverseRelations.nodes
      .filter((relation) => relation.type === "blocks")
      .map((relation) => relation.issue.id),
  };
}
