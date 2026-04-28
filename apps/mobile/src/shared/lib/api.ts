import {
  mobileAuthLoginResponseSchema,
  mobileBootstrapResponseSchema,
  mobileCreateShiftRequestResponseSchema,
  mobileMeScheduleResponseSchema,
  mobileNotificationReadResponseSchema,
  mobileNotificationsResponseSchema,
  mobileOrgScheduleResponseSchema,
  mobilePeopleResponseSchema,
  mobilePersonStatusUpdateResponseSchema,
  mobilePushTokenResponseSchema,
  mobileShiftRequestsResponseSchema,
  mobileUpdateShiftRequestResponseSchema,
  mobileWorkspaceLookupResponseSchema,
  type MobileAuthLoginResponse,
  type MobileCreateShiftRequestBody,
  type MobileBootstrapResponse,
  type MobilePersonStatusUpdateBody,
  type MobileScheduleRange,
  type MobileUpdateShiftRequestBody,
} from "@dubgrid/contracts";
import {
  appendQueryParams,
  createHeaders,
  createJsonApiRequest,
  getRequestOrigin,
} from "@dubgrid/api-client";
import { getMobileEnvConfig } from "./env";

function assertApiBaseUrl(): string {
  return getMobileEnvConfig().apiBaseUrl;
}

function createMobileTransportErrorMessage(
  baseUrl: string,
  error: unknown,
): string {
  const details =
    error instanceof Error && error.message.trim()
      ? ` (${error.message.trim()})`
      : "";

  return `We couldn't reach the mobile backend at ${getRequestOrigin(baseUrl)}${details}. Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local and make sure your phone can reach that host.`;
}

function createNonJsonApiErrorMessage(
  baseUrl: string,
  path: string,
  response: Response,
): string {
  const resolvedUrl =
    typeof response.url === "string" && response.url.length > 0
      ? response.url
      : `${baseUrl}${path}`;

  return `The backend at ${getRequestOrigin(resolvedUrl)} is not serving the mobile API endpoint ${path} (HTTP ${response.status}). Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local or point the app at a reachable local web server.`;
}

export async function mobileApiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
  parse: (value: unknown) => T,
): Promise<T> {
  const headers = createHeaders(init, {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": init.body !== undefined ? "application/json" : undefined,
  });

  return mobileRequest(
    path,
    {
      ...init,
      headers,
    },
    parse,
    true,
  );
}

async function mobilePublicApiRequest<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
): Promise<T> {
  const headers = createHeaders(init, {
    "Content-Type": init.body !== undefined ? "application/json" : undefined,
  });

  return mobileRequest(
    path,
    {
      ...init,
      headers,
    },
    parse,
    false,
  );
}

async function mobileRequest<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
  handleAuthFailure: boolean,
): Promise<T> {
  const baseUrl = assertApiBaseUrl();
  return createJsonApiRequest({
    baseUrl,
    path,
    init,
    parse,
    handleAuthFailure,
    onAuthFailure: async () => {
      const { handleExpiredMobileSession } = await import("./auth-reset");
      await handleExpiredMobileSession();
    },
    onTransportErrorMessage: createMobileTransportErrorMessage,
    onNonJsonErrorMessage: createNonJsonApiErrorMessage,
  });
}

function withQuery(
  path: string,
  query?: {
    startDate?: string;
    endDate?: string;
  },
): string {
  return appendQueryParams(path, query);
}

export function getBootstrap(
  accessToken: string,
): Promise<MobileBootstrapResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/bootstrap",
    accessToken,
    { method: "GET" },
    (value) => mobileBootstrapResponseSchema.parse(value),
  );
}

export function lookupWorkspace(workspaceSlug: string) {
  return mobilePublicApiRequest(
    `/api/mobile/v1/auth/workspace?slug=${encodeURIComponent(workspaceSlug.trim().toLowerCase())}`,
    { method: "GET" },
    (value) => mobileWorkspaceLookupResponseSchema.parse(value),
  );
}

export function loginToWorkspace(input: {
  workspaceSlug: string;
  email: string;
  password: string;
}): Promise<MobileAuthLoginResponse> {
  return mobilePublicApiRequest(
    "/api/mobile/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    (value) => mobileAuthLoginResponseSchema.parse(value),
  );
}

export function getMySchedule(
  accessToken: string,
  query?: MobileScheduleRange,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/me/schedule", query),
    accessToken,
    { method: "GET" },
    (value) => mobileMeScheduleResponseSchema.parse(value),
  );
}

export function getOrgSchedule(
  accessToken: string,
  query?: MobileScheduleRange,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/org/schedule", query),
    accessToken,
    { method: "GET" },
    (value) => mobileOrgScheduleResponseSchema.parse(value),
  );
}

export function getShiftRequests(
  accessToken: string,
  query?: MobileScheduleRange,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/shift-requests", query),
    accessToken,
    { method: "GET" },
    (value) => mobileShiftRequestsResponseSchema.parse(value),
  );
}

export function createShiftRequest(
  accessToken: string,
  body: MobileCreateShiftRequestBody,
) {
  return mobileApiRequest(
    "/api/mobile/v1/shift-requests",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobileCreateShiftRequestResponseSchema.parse(value),
  );
}

export function updateShiftRequest(
  accessToken: string,
  requestId: string,
  body: MobileUpdateShiftRequestBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/shift-requests/${requestId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobileUpdateShiftRequestResponseSchema.parse(value),
  );
}

export function getNotifications(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/notifications",
    accessToken,
    { method: "GET" },
    (value) => mobileNotificationsResponseSchema.parse(value),
  );
}

export function markNotificationRead(
  accessToken: string,
  notificationId: string,
) {
  return mobileApiRequest(
    `/api/mobile/v1/notifications/${notificationId}`,
    accessToken,
    { method: "PATCH" },
    (value) => mobileNotificationReadResponseSchema.parse(value),
  );
}

export function markAllNotificationsRead(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/notifications/read-all",
    accessToken,
    { method: "POST" },
    (value) => mobileNotificationReadResponseSchema.parse(value),
  );
}

export function getPeople(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/people",
    accessToken,
    { method: "GET" },
    (value) => mobilePeopleResponseSchema.parse(value),
  );
}

export function updateMobilePersonStatus(
  accessToken: string,
  personId: string,
  body: MobilePersonStatusUpdateBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/status`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonStatusUpdateResponseSchema.parse(value),
  );
}

export function registerPushToken(
  accessToken: string,
  body: {
    platform: "ios" | "android";
    expoPushToken: string;
    disabled?: boolean;
  },
) {
  return mobileApiRequest(
    "/api/mobile/v1/push-tokens",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobilePushTokenResponseSchema.parse(value),
  );
}
