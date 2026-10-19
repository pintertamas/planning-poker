export type CreateDecision = {
  hasRoom: boolean;
  hostSecret: string | null;
  create: boolean;
};

export const canCreateRoom = ({ hasRoom, hostSecret, create }: CreateDecision): boolean =>
  !hasRoom && create && hostSecret !== null && hostSecret.length > 0;
