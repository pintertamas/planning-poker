export type StartVoteDecision = { kind: "start" } | { kind: "choose"; peekedId: string };

export function decideStartVote(
  currentId: string | null,
  peekedId: string | null,
  ticketIds: readonly string[],
): StartVoteDecision {
  if (currentId === null || peekedId === null || peekedId === currentId) return { kind: "start" };
  if (!ticketIds.includes(peekedId)) return { kind: "start" };
  return { kind: "choose", peekedId };
}
