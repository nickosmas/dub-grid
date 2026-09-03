export function getScheduleRealtimeChannelOptions(editorSessionId: string) {
  return {
    config: {
      private: true,
      broadcast: { ack: true },
      presence: { key: editorSessionId },
    },
  } as const;
}
