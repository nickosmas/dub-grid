export function createHeaders(
  init: RequestInit,
  extraHeaders: Record<string, string | undefined>,
): Headers {
  const headers = new Headers(init.headers);

  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
}

export function getRequestOrigin(candidate: string): string {
  try {
    return new URL(candidate).origin;
  } catch {
    return candidate;
  }
}

export function appendQueryParams(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  if (!query) {
    return path;
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export async function createJsonApiRequest<T>(input: {
  baseUrl: string;
  path: string;
  init: RequestInit;
  parse: (value: unknown) => T;
  handleAuthFailure?: boolean;
  onAuthFailure?: () => Promise<void> | void;
  onTransportErrorMessage?: (baseUrl: string, error: unknown) => string;
  onNonJsonErrorMessage?: (baseUrl: string, path: string, response: Response) => string;
  onResponse?: (response: Response) => void;
}): Promise<T> {
  const {
    baseUrl,
    path,
    init,
    parse,
    handleAuthFailure = false,
    onAuthFailure,
    onTransportErrorMessage,
    onNonJsonErrorMessage,
    onResponse,
  } = input;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: init.headers,
    });
  } catch (error) {
    throw new Error(
      onTransportErrorMessage?.(baseUrl, error) ??
        `Request failed for ${getRequestOrigin(baseUrl)}`,
    );
  }

  onResponse?.(response);

  const contentType = response.headers?.get?.("content-type") ?? "";
  const payload = await response.json().catch(() => null);
  const isJsonResponse = contentType.includes("application/json") || payload !== null;

  if (!response.ok) {
    if (!isJsonResponse) {
      throw new Error(
        onNonJsonErrorMessage?.(baseUrl, path, response) ??
          `Non-JSON response for ${path} (${response.status})`,
      );
    }

    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Request failed";

    if (
      handleAuthFailure &&
      (response.status === 401 || message === "Invalid session" || message === "Unauthenticated")
    ) {
      await onAuthFailure?.();
    }

    throw new ApiResponseError(message, response.status, payload);
  }

  return parse(payload);
}
