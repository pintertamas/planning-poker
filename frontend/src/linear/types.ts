import type { Estimate, Ticket } from "@shared/types";

export type LinearTeam = {
  id: string;
  key: string;
  name: string;
  estimationType: string;
  estimationExtended: boolean;
  estimationAllowZero: boolean;
  groomedStateId: string | null;
};

export type LinearView = {
  id: string;
  name: string;
  description: string | null;
  shared: boolean;
  teamKey: string | null;
};

export type IssuePage = { tickets: Ticket[]; nextCursor: string | null };

export type ScaleCheck = { ok: boolean; reason: string | null };

export type Viewer = { id: string; name: string; email: string };

export interface LinearService {
  mode: "live" | "demo";
  getViewer(): Promise<Viewer>;
  listTeams(): Promise<LinearTeam[]>;
  listViews(): Promise<LinearView[]>;
  issuesFromView(viewId: string, cursor?: string): Promise<IssuePage>;
  issuesFromTeam(teamId: string, cursor?: string): Promise<IssuePage>;
  issuesByRefs(refs: string[]): Promise<{ tickets: Ticket[]; notFound: string[] }>;
  searchIssues(query: string): Promise<Ticket[]>;
  checkEstimateScale(teamId: string): Promise<ScaleCheck>;
  commitEstimate(ticket: Ticket, estimate: Estimate): Promise<void>;
}
