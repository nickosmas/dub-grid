export const SELF_ACTION_FORBIDDEN_CODE = "SELF_ACTION_FORBIDDEN";

export const SELF_ACTION_FORBIDDEN_MESSAGE =
  "You can't perform this action on your own account. Ask another admin.";

export class SelfActionForbiddenError extends Error {
  readonly code = SELF_ACTION_FORBIDDEN_CODE;

  constructor(message: string = SELF_ACTION_FORBIDDEN_MESSAGE) {
    super(message);
    this.name = "SelfActionForbiddenError";
  }
}

export function isSelfAction(
  actorUserId: string | null | undefined,
  targetUserId: string | null | undefined,
): boolean {
  if (!actorUserId || !targetUserId) return false;
  return actorUserId === targetUserId;
}

export function assertNotSelf(
  actorUserId: string | null | undefined,
  targetUserId: string | null | undefined,
): void {
  if (isSelfAction(actorUserId, targetUserId)) {
    throw new SelfActionForbiddenError();
  }
}
