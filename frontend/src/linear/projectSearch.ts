import type { LinearProject } from "./types";

const PROJECT_LINK = /(?:https?:\/\/)?linear\.app\/[^/\s]+\/project\/([^/?#\s]*)/i;
const TRAILING_SLUG_ID = /(?:^|-)([0-9a-f]{12})$/i;
const BARE_SLUG_ID = /^[0-9a-f]{12}$/i;

export function parseProjectLink(text: string): string | null {
  const trimmed = text.trim();
  if (BARE_SLUG_ID.test(trimmed)) return trimmed.toLowerCase();
  const link = PROJECT_LINK.exec(trimmed);
  const segment = link?.[1];
  if (!segment) return null;
  const match = TRAILING_SLUG_ID.exec(segment);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function byName(a: LinearProject, b: LinearProject): number {
  return a.name.localeCompare(b.name);
}

export function matchProjects(projects: LinearProject[], query: string): LinearProject[] {
  const slugId = parseProjectLink(query);
  if (slugId !== null) {
    return projects.filter((project) => project.slugId.toLowerCase() === slugId);
  }

  const tokens = normalize(query).split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) return [...projects].sort(byName);

  const first = tokens[0] ?? "";
  const ranked: { project: LinearProject; startsWithFirst: number; position: number }[] = [];
  for (const project of projects) {
    const name = normalize(project.name);
    const positions = tokens.map((token) => name.indexOf(token));
    if (positions.some((position) => position < 0)) continue;
    ranked.push({
      project,
      startsWithFirst: name.startsWith(first) ? 0 : 1,
      position: Math.min(...positions),
    });
  }
  ranked.sort(
    (a, b) =>
      a.startsWithFirst - b.startsWithFirst || a.position - b.position || byName(a.project, b.project),
  );
  return ranked.map((entry) => entry.project);
}
