export function getScheduleRealtimeChannelOptions(editorSessionId: string) {
  return {
    config: {
      private: true,
      broadcast: { ack: true },
      presence: { key: editorSessionId },
    },
  } as const;
}

/** The shared topic every member joins: presence, publish and discard signals. */
export function getScheduleChannelName(orgId: string): string {
  return `schedule:${orgId}`;
}

/**
 * The editor-only topic that carries draft diffs. Migration 035 admits only
 * editors to it, so a viewer's socket never receives unpublished state.
 */
export function getScheduleDraftsChannelName(orgId: string): string {
  return `${getScheduleChannelName(orgId)}:drafts`;
}

export function getScheduleDraftsChannelOptions() {
  return {
    config: {
      private: true,
      broadcast: { ack: true },
    },
  } as const;
}

/** Mirrors the receive policy on the draft topic; joining without it is refused server-side. */
export function canJoinScheduleDraftsChannel(permissions: {
  canEditShifts: boolean;
  canEditNotes: boolean;
}): boolean {
  return permissions.canEditShifts || permissions.canEditNotes;
}
