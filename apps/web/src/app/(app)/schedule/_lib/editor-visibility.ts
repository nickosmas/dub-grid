export function shouldShowScheduleEditorNames(
  onlineUsers: Array<{ userId: string }>,
  currentUserId?: string | null,
): boolean {
  const distinctUserIds = new Set<string>();

  if (currentUserId) {
    distinctUserIds.add(currentUserId);
  }

  for (const user of onlineUsers) {
    distinctUserIds.add(user.userId);
  }

  return distinctUserIds.size >= 2;
}

export function shouldRenderScheduleAuthorNames(args: {
  showAudit: boolean;
  onlineUsers: Array<{ userId: string }>;
  currentUserId?: string | null;
}): boolean {
  const { showAudit, onlineUsers, currentUserId } = args;
  return showAudit || shouldShowScheduleEditorNames(onlineUsers, currentUserId);
}
