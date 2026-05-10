import {
  mobileAuthLoginResponseSchema,
  mobileBootstrapResponseSchema,
  mobileCreateShiftRequestResponseSchema,
  mobileMeScheduleResponseSchema,
  mobileNotificationPreferencesResponseSchema,
  mobileProfileChangeRequestActionResponseSchema,
  mobileProfileChangeRequestCreateResponseSchema,
  mobileProfileChangeRequestsResponseSchema,
  mobileProfileAccountUpdateResponseSchema,
  mobileProfilePhoneUpdateResponseSchema,
  mobileProfileResponseSchema,
  mobileProfileSessionRevokeResponseSchema,
  mobileProfileSessionsResponseSchema,
  mobileNotificationReadResponseSchema,
  mobileNotificationsResponseSchema,
  mobileOrgScheduleResponseSchema,
  mobilePersonResponseSchema,
  mobilePeopleResponseSchema,
  mobilePersonInvitationResponseSchema,
  mobilePersonStatusUpdateResponseSchema,
  mobilePersonUpdateResponseSchema,
  mobilePushTokenResponseSchema,
  mobileShiftRequestsResponseSchema,
  mobileShiftSwapOptionsResponseSchema,
  mobileUpdateShiftRequestResponseSchema,
  mobileWorkspaceLookupResponseSchema,
  type MobileAuthSession,
  type MobileAuthLoginResponse,
  type MobileCreateShiftRequestBody,
  type MobileBootstrapResponse,
  type MobilePersonInvitationActionBody,
  type MobilePersonInvitationCreateBody,
  type MobileNotificationPreferences,
  type MobileProfileChangeRequestActionBody,
  type MobileProfileChangeRequestCreateBody,
  type MobileProfileAccountUpdateBody,
  type MobileProfilePhoneUpdateBody,
  type MobileProfileResponse,
  type MobilePersonStatusUpdateBody,
  type MobilePersonUpdateBody,
  type MobileScheduleRange,
  type MobileUpdateShiftRequestBody,
} from "@dubgrid/contracts";
import {
  ApiResponseError,
  appendQueryParams,
  createHeaders,
  createJsonApiRequest,
} from "@dubgrid/api-client";
import { Platform } from "react-native";
import { getMobileEnvConfig } from "./env";

type SupabaseSessionLike = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

function assertApiBaseUrl(): string {
  return getMobileEnvConfig().apiBaseUrl;
}

function createMobileTransportErrorMessage(
  baseUrl: string,
  error: unknown,
): string {
  void baseUrl;
  void error;
  return "We couldn't connect to DubGrid from this device. Check your internet connection and try again.";
}

function createNonJsonApiErrorMessage(
  baseUrl: string,
  path: string,
  response: Response,
): string {
  void baseUrl;
  void path;
  void response;
  return "DubGrid isn't responding correctly right now. Try again in a moment.";
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

export type MobileNameMismatchDetails = {
  employeeId: string | null;
  userId: string;
  employeeFirstName: string;
  employeeLastName: string;
  accountFirstName: string;
  accountLastName: string;
};

export type MobileAccountLinkChallenge =
  | {
      kind: "account_found";
      details: MobileNameMismatchDetails;
    }
  | {
      kind: "name_mismatch";
      details: MobileNameMismatchDetails;
    };

export class MobileNameMismatchError extends Error {
  readonly code = "NAME_MISMATCH" as const;

  constructor(
    public readonly details: MobileNameMismatchDetails,
    message = "The user account name does not match the employee record.",
  ) {
    super(message);
    this.name = "MobileNameMismatchError";
  }
}

export class MobileAccountFoundError extends Error {
  readonly code = "ACCOUNT_FOUND" as const;

  constructor(
    public readonly details: MobileNameMismatchDetails,
    message = "An existing account was found for this email.",
  ) {
    super(message);
    this.name = "MobileAccountFoundError";
  }
}

function parseMobileAccountLinkDetails(
  details: Partial<MobileNameMismatchDetails> | undefined,
): MobileNameMismatchDetails | null {
  if (
    !details ||
    typeof details.userId !== "string" ||
    typeof details.employeeFirstName !== "string" ||
    typeof details.employeeLastName !== "string" ||
    typeof details.accountFirstName !== "string" ||
    typeof details.accountLastName !== "string"
  ) {
    return null;
  }

  return {
    employeeId:
      typeof details.employeeId === "string" ? details.employeeId : null,
    userId: details.userId,
    employeeFirstName: details.employeeFirstName,
    employeeLastName: details.employeeLastName,
    accountFirstName: details.accountFirstName,
    accountLastName: details.accountLastName,
  };
}

export function parseMobileAccountLinkChallenge(
  error: unknown,
): MobileAccountLinkChallenge | null {
  if (!(error instanceof ApiResponseError)) {
    return null;
  }
  const payload = error.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    code?: unknown;
    details?: Partial<MobileNameMismatchDetails>;
    error?: unknown;
  };
  const details = parseMobileAccountLinkDetails(candidate.details);
  if (!details) {
    return null;
  }

  if (candidate.code === "ACCOUNT_FOUND") {
    return { kind: "account_found", details };
  }

  if (candidate.code === "NAME_MISMATCH") {
    return { kind: "name_mismatch", details };
  }

  return null;
}

export function parseMobileNameMismatchError(
  error: unknown,
): MobileNameMismatchError | null {
  const challenge = parseMobileAccountLinkChallenge(error);
  if (challenge?.kind !== "name_mismatch") {
    return null;
  }

  return new MobileNameMismatchError(challenge.details);
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

export function getProfile(
  accessToken: string,
): Promise<MobileProfileResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/profile",
    accessToken,
    { method: "GET" },
    (value) => mobileProfileResponseSchema.parse(value),
  );
}

export function updateProfilePhone(
  accessToken: string,
  body: MobileProfilePhoneUpdateBody,
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/phone",
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobileProfilePhoneUpdateResponseSchema.parse(value),
  );
}

export function updateProfileAccount(
  accessToken: string,
  body: MobileProfileAccountUpdateBody,
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/account",
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobileProfileAccountUpdateResponseSchema.parse(value),
  );
}

export function getProfileChangeRequests(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/change-requests",
    accessToken,
    { method: "GET" },
    (value) => mobileProfileChangeRequestsResponseSchema.parse(value),
  );
}

export function getAdminProfileChangeRequests(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/change-requests?scope=admin",
    accessToken,
    { method: "GET" },
    (value) => mobileProfileChangeRequestsResponseSchema.parse(value),
  );
}

export function createProfileChangeRequest(
  accessToken: string,
  body: MobileProfileChangeRequestCreateBody,
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/change-requests",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobileProfileChangeRequestCreateResponseSchema.parse(value),
  );
}

export function updateProfileChangeRequest(
  accessToken: string,
  requestId: string,
  body: MobileProfileChangeRequestActionBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/profile/change-requests/${encodeURIComponent(requestId)}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobileProfileChangeRequestActionResponseSchema.parse(value),
  );
}

export function getProfileNotificationPreferences(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/notification-preferences",
    accessToken,
    { method: "GET" },
    (value) => mobileNotificationPreferencesResponseSchema.parse(value),
  );
}

export function saveProfileNotificationPreferences(
  accessToken: string,
  prefs: MobileNotificationPreferences,
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/notification-preferences",
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ prefs }),
    },
    (value) => mobileNotificationPreferencesResponseSchema.parse(value),
  );
}

export function getProfileSessions(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/sessions",
    accessToken,
    { method: "GET" },
    (value) => mobileProfileSessionsResponseSchema.parse(value),
  );
}

export function revokeProfileSession(
  accessToken: string,
  refreshTokenHash: string,
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/sessions",
    accessToken,
    {
      method: "DELETE",
      body: JSON.stringify({ refreshTokenHash }),
    },
    (value) => mobileProfileSessionRevokeResponseSchema.parse(value),
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

function mapSupabaseSessionToMobileAuthSession(
  session: Pick<
    SupabaseSessionLike,
    "access_token" | "refresh_token" | "expires_in" | "token_type"
  >,
): MobileAuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    tokenType: session.token_type,
  };
}

export async function verifyMobileTotpFactor(input: {
  session: MobileAuthSession;
  factorId: string;
  code: string;
}): Promise<MobileAuthSession> {
  const { createEphemeralSupabaseClient } = await import("./supabase");
  const mfaClient = createEphemeralSupabaseClient();

  const { error: setSessionError } = await mfaClient.auth.setSession({
    access_token: input.session.accessToken,
    refresh_token: input.session.refreshToken,
  });

  if (setSessionError) {
    throw setSessionError;
  }

  const { data, error } = await mfaClient.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });

  if (error) {
    throw error;
  }

  const { data: refreshData, error: refreshError } =
    await mfaClient.auth.refreshSession({
      refresh_token: data.refresh_token,
    });

  if (refreshError) {
    throw refreshError;
  }

  if (!refreshData.session) {
    throw new Error("We couldn't refresh your verified mobile session.");
  }

  return mapSupabaseSessionToMobileAuthSession(refreshData.session);
}

export function registerMobileSessionPresence(
  accessToken: string,
): Promise<{ success: true }> {
  const platform = getNativeSessionPlatform();
  if (!platform) {
    return Promise.resolve({ success: true });
  }

  return mobileApiRequest(
    "/api/mobile/v1/session-presence",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        platform,
        deviceLabel: `DubGrid Mobile on ${platform === "ios" ? "iOS" : "Android"}`,
      }),
    },
    (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        (value as { success?: unknown }).success === true
      ) {
        return { success: true };
      }

      throw new Error("We couldn't update your session status.");
    },
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

function getNativeSessionPlatform(): "ios" | "android" | null {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return Platform.OS;
  }

  return null;
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

export function getShiftSwapOptions(
  accessToken: string,
  query: MobileScheduleRange & {
    requesterEmpId: string;
    requesterShiftDate: string;
  },
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/shift-requests/swap-options", query),
    accessToken,
    { method: "GET" },
    (value) => mobileShiftSwapOptionsResponseSchema.parse(value),
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

export function getMobilePerson(accessToken: string, personId: string) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}`,
    accessToken,
    { method: "GET" },
    (value) => mobilePersonResponseSchema.parse(value),
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

export function updateMobilePerson(
  accessToken: string,
  personId: string,
  body: MobilePersonUpdateBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonUpdateResponseSchema.parse(value),
  );
}

export function createMobilePersonInvitation(
  accessToken: string,
  personId: string,
  body: MobilePersonInvitationCreateBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/invitation`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonInvitationResponseSchema.parse(value),
  );
}

export function resendMobilePersonInvitation(
  accessToken: string,
  personId: string,
  body: MobilePersonInvitationActionBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/invitation`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonInvitationResponseSchema.parse(value),
  );
}

export function revokeMobilePersonInvitation(
  accessToken: string,
  personId: string,
  body: MobilePersonInvitationActionBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/invitation`,
    accessToken,
    {
      method: "DELETE",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonInvitationResponseSchema.parse(value),
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
