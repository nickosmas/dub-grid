export function getQueryErrorMessage(
  error: unknown,
  fallback = "We couldn't load this right now.",
): string {
  return error instanceof Error ? error.message : fallback;
}

export function getMobileQueryContentState(input: {
  hasData: boolean;
  isLoading: boolean;
  error: unknown;
}) {
  if (input.isLoading && !input.hasData) {
    return { kind: "loading" } as const;
  }

  if (input.error && !input.hasData) {
    return {
      kind: "error",
      message: getQueryErrorMessage(input.error),
    } as const;
  }

  if (!input.hasData) {
    return { kind: "empty" } as const;
  }

  return { kind: "ready" } as const;
}
