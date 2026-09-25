import {
  mobileAuthLoginResponseSchema,
  mfaMutationResponseSchema,
  mobileBootstrapResponseSchema,
  mobileCreateShiftRequestResponseSchema,
  mobileDashboardResponseSchema,
  mobileMeScheduleResponseSchema,
  mobileNotificationPreferencesResponseSchema,
  mobileProfileChangeRequestActionResponseSchema,
  mobileProfileChangeRequestCreateResponseSchema,
  mobileProfileChangeRequestsResponseSchema,
  mobileProfileAccountUpdateResponseSchema,
  mobileProfileMfaStatusUpdateResponseSchema,
  mobileProfilePhoneUpdateResponseSchema,
  mobileProfileResponseSchema,
  mobileProfileSessionRevokeResponseSchema,
  mobileCalendarSubscriptionIssuedSchema,
  mobileCalendarSubscriptionStatusSchema,
  mobileProfileSessionsResponseSchema,
  mobileNotificationBulkResponseSchema,
  mobileNotificationFacetsSchema,
  mobileNotificationReadResponseSchema,
  mobileNotificationsResponseSchema,
  mobileManagementAccessResponseSchema,
  mobileManagementUserResponseSchema,
  mobileManagementUsersResponseSchema,
  mobileOrgScheduleResponseSchema,
  mobilePersonResponseSchema,
  mobilePersonCreateResponseSchema,
  mobilePeopleResponseSchema,
  mobilePersonInvitationResponseSchema,
  mobilePersonOrgRoleResponseSchema,
  mobilePersonStatusUpdateResponseSchema,
  mobilePersonUpdateResponseSchema,
  mobilePushTokenResponseSchema,
  mobileShiftRequestsResponseSchema,
  mobileShiftRequestHistoryResponseSchema,
  mobileShiftSwapOptionsResponseSchema,
  mobileUpdateShiftRequestResponseSchema,
  mobileOrganizationLookupResponseSchema,
  mobileOrgStatusResponseSchema,
  mobileTermsAcceptanceResponseSchema,
  type MobileAuthSession,
  type MobileAuthLoginResponse,
  type MobileCreateShiftRequestBody,
  type MobileBootstrapResponse,
  type MobileOrgStatusResponse,
  type MobileTermsAcceptanceResponse,
  type MobileManagementAccessBody,
  type MobileManagementAccessRemoveBody,
  type MobileManagementUserInvitationActionBody,
  type MobileManagementUserInviteBody,
  type MobileManagementUserRemoveBody,
  type MobileManagementUserUpdateBody,
  type MobilePersonInvitationActionBody,
  type MobilePersonCreateBody,
  type MobilePersonInvitationCreateBody,
  type MobileNotificationPreferences,
  type MobileProfileChangeRequestActionBody,
  type MobileProfileChangeRequestCreateBody,
  type MobileProfileAccountUpdateBody,
  type MobileProfileMfaStatusUpdateBody,
  type MobileProfilePhoneUpdateBody,
  type MobileProfileResponse,
  type MobilePersonOrgRoleBody,
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
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import {
  authEntryRecorder,
  type AuthEntryRequestKind,
} from "../../features/auth/lib/auth-entry-measurement";
import { getMobileEnvConfig } from "./env";

type SupabaseSessionLike = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

const MOBILE_REQUEST_TIMEOUT_MS = 15_000;

function getAuthEntryRequestKind(path: string): AuthEntryRequestKind | null {
  if (path === "/api/mobile/v1/auth/login") return "login";
  if (path === "/api/mobile/v1/bootstrap") return "bootstrap";
  if (path === "/api/mobile/v1/session-presence") return "session_presence";
  return null;
}

function assertApiBaseUrl(): string {
  return getMobileEnvConfig().apiBaseUrl;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
}

function createMobileTransportErrorMessage(baseUrl: string, error: unknown): string {
  void baseUrl;
  if (isAbortError(error)) {
    return "This is taking longer than expected. Check your internet connection and try again.";
  }

  return "We couldn't connect right now. Check your internet connection and try again.";
}

function createNonJsonApiErrorMessage(baseUrl: string, path: string, response: Response): string {
  void baseUrl;
  void path;
  void response;
  return "Please try again in a moment.";
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
    accessToken,
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
    null,
  );
}

/** `requestToken` is the bearer this request carried, or null for a public call. */
async function mobileRequest<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
  requestToken: string | null,
): Promise<T> {
  const handleAuthFailure = requestToken !== null;
  const measurementRequestKind = getAuthEntryRequestKind(path);
  const measurementStartedAt = globalThis.performance?.now() ?? Date.now();
  let serverTiming: string | null = null;
  const baseUrl = assertApiBaseUrl();
  const timeoutController = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => timeoutController.abort();
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timeoutController.abort();
  }, MOBILE_REQUEST_TIMEOUT_MS);

  try {
    return await createJsonApiRequest({
      baseUrl,
      path,
      init: {
        ...init,
        signal: timeoutController.signal,
      },
      parse,
      handleAuthFailure,
      onAuthFailure: async () => {
        if (!requestToken) return;
        const { handleRejectedMobileToken } = await import("./auth-reset");
        await handleRejectedMobileToken(requestToken);
      },
      onTransportErrorMessage: createMobileTransportErrorMessage,
      onNonJsonErrorMessage: createNonJsonApiErrorMessage,
      onResponse: (response: Response) => {
        serverTiming = response.headers?.get?.("server-timing") ?? null;
      },
    });
  } finally {
    if (measurementRequestKind) {
      const measurementEndedAt = globalThis.performance?.now() ?? Date.now();
      authEntryRecorder.recordRequest(
        measurementRequestKind,
        measurementEndedAt - measurementStartedAt,
        serverTiming,
      );
    }
    callerSignal?.removeEventListener("abort", abortFromCaller);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }
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
    employeeId: typeof details.employeeId === "string" ? details.employeeId : null,
    userId: details.userId,
    employeeFirstName: details.employeeFirstName,
    employeeLastName: details.employeeLastName,
    accountFirstName: details.accountFirstName,
    accountLastName: details.accountLastName,
  };
}

export function parseMobileAccountLinkChallenge(error: unknown): MobileAccountLinkChallenge | null {
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

export function parseMobileNameMismatchError(error: unknown): MobileNameMismatchError | null {
  const challenge = parseMobileAccountLinkChallenge(error);
  if (challenge?.kind !== "name_mismatch") {
    return null;
  }

  return new MobileNameMismatchError(challenge.details);
}

export type MobileStaffField = "firstName" | "lastName" | "email" | "phone" | "contactNotes";

export type MobileContactConflictReason = "employee_duplicate" | "gridmaster" | "other_account";

const CONTACT_CONFLICT_FIELDS: Record<string, MobileStaffField> = {
  email: "email",
  phone: "phone",
  name: "firstName",
};

/**
 * A save the server rejected for a duplicate email, phone or name, mapped back
 * onto the field that caused it. Without this the 409's message lands in a
 * toast, the offending input stays unmarked, and Save stays enabled to fail the
 * same way again.
 */
export function parseMobileContactConflict(
  error: unknown,
): { field: MobileStaffField; message: string } | null {
  if (!(error instanceof ApiResponseError) || error.status !== 409) {
    return null;
  }
  const payload = error.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as { code?: unknown; field?: unknown; message?: unknown };
  if (candidate.code !== "EMPLOYEE_CONTACT_CONFLICT" || typeof candidate.field !== "string") {
    return null;
  }

  const field = CONTACT_CONFLICT_FIELDS[candidate.field];
  if (!field) return null;

  return {
    field,
    message:
      typeof candidate.message === "string" && candidate.message
        ? candidate.message
        : "That value is already used by another person on your team.",
  };
}

/**
 * The per-field errors a 400 carries when the server's own validation rejected
 * the body, so a rule the client missed still lands on the right input.
 */
export function parseMobileStaffFieldErrors(
  error: unknown,
): Partial<Record<MobileStaffField, string>> | null {
  if (!(error instanceof ApiResponseError) || error.status !== 400) {
    return null;
  }
  const payload = error.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const fieldErrors = (payload as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") {
    return null;
  }

  const mapped: Partial<Record<MobileStaffField, string>> = {};
  for (const [key, value] of Object.entries(fieldErrors as Record<string, unknown>)) {
    if (typeof value === "string" && value) {
      mapped[key as MobileStaffField] = value;
    }
  }

  return Object.keys(mapped).length > 0 ? mapped : null;
}

export function getBootstrap(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MobileBootstrapResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/bootstrap",
    accessToken,
    { method: "GET", signal },
    (value) => mobileBootstrapResponseSchema.parse(value),
  );
}

export function acceptCurrentTerms(accessToken: string): Promise<MobileTermsAcceptanceResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/profile/terms",
    accessToken,
    { method: "POST", body: JSON.stringify({}) },
    (value) => mobileTermsAcceptanceResponseSchema.parse(value),
  );
}

export function getOrgStatus(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MobileOrgStatusResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/org-status",
    accessToken,
    { method: "GET", signal },
    (value) => mobileOrgStatusResponseSchema.parse(value),
  );
}

export function getProfile(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MobileProfileResponse> {
  return mobileApiRequest(
    "/api/mobile/v1/profile",
    accessToken,
    { method: "GET", signal },
    (value) => mobileProfileResponseSchema.parse(value),
  );
}

export function updateProfilePhone(accessToken: string, body: MobileProfilePhoneUpdateBody) {
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

export function updateProfileAccount(accessToken: string, body: MobileProfileAccountUpdateBody) {
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

export function updateProfileMfaStatus(
  accessToken: string,
  body: MobileProfileMfaStatusUpdateBody = {},
) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/mfa-status",
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobileProfileMfaStatusUpdateResponseSchema.parse(value),
  );
}

export function requireMobileCredentialAssurance(accessToken: string) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/credential-assurance",
    accessToken,
    { method: "POST" },
    (value) => mfaMutationResponseSchema.parse(value),
  );
}

export type MobileSignOutScope = "local" | "others" | "global";

/**
 * Records the revocation in DubGrid before the device drops its tokens: API
 * routes verify tokens locally, so a provider sign-out alone leaves a copied
 * access token working until it expires. A 401 here never starts a session
 * teardown, because the caller is already signing out.
 */
export function signOutMobileSessions(
  accessToken: string,
  body: { scope: MobileSignOutScope; reason?: "password_recovery" | "password_change" },
) {
  const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
  return mobileRequest(
    "/api/mobile/v1/auth/sign-out",
    {
      ...init,
      headers: createHeaders(init, {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      }),
    },
    (value) => mfaMutationResponseSchema.parse(value),
    null,
  );
}

export function getProfileChangeRequests(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/change-requests",
    accessToken,
    { method: "GET", signal },
    (value) => mobileProfileChangeRequestsResponseSchema.parse(value),
  );
}

export function getAdminProfileChangeRequests(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/change-requests?scope=admin",
    accessToken,
    { method: "GET", signal },
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

export function getProfileNotificationPreferences(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/notification-preferences",
    accessToken,
    { method: "GET", signal },
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

export function getProfileSessions(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/profile/sessions",
    accessToken,
    { method: "GET", signal },
    (value) => mobileProfileSessionsResponseSchema.parse(value),
  );
}

export function revokeProfileSession(accessToken: string, refreshTokenHash: string) {
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

const CALENDAR_SUBSCRIPTION_PATH = "/api/mobile/v1/profile/calendar-subscription";

export function getCalendarSubscription(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    CALENDAR_SUBSCRIPTION_PATH,
    accessToken,
    { method: "GET", signal },
    (value) => mobileCalendarSubscriptionStatusSchema.parse(value),
  );
}

export function createCalendarSubscription(accessToken: string) {
  return mobileApiRequest(CALENDAR_SUBSCRIPTION_PATH, accessToken, { method: "POST" }, (value) =>
    mobileCalendarSubscriptionIssuedSchema.parse(value),
  );
}

export function rotateCalendarSubscription(accessToken: string) {
  return mobileApiRequest(CALENDAR_SUBSCRIPTION_PATH, accessToken, { method: "PUT" }, (value) =>
    mobileCalendarSubscriptionIssuedSchema.parse(value),
  );
}

export function revokeCalendarSubscription(accessToken: string) {
  return mobileApiRequest(CALENDAR_SUBSCRIPTION_PATH, accessToken, { method: "DELETE" }, (value) =>
    mobileCalendarSubscriptionStatusSchema.parse(value),
  );
}

export function lookupOrganization(orgSlug: string) {
  return mobilePublicApiRequest(
    `/api/mobile/v1/auth/organization?slug=${encodeURIComponent(orgSlug.trim().toLowerCase())}`,
    { method: "GET" },
    (value) => mobileOrganizationLookupResponseSchema.parse(value),
  );
}

export function loginToOrganization(input: {
  orgSlug: string;
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

export function requestPasswordRecovery(email: string): Promise<{ success: true }> {
  return mobilePublicApiRequest(
    "/api/mobile/v1/auth/recovery-request",
    { method: "POST", body: JSON.stringify({ email }) },
    (value) => {
      if (
        typeof value !== "object" ||
        value === null ||
        (value as { success?: unknown }).success !== true
      ) {
        throw new Error("Recovery request failed");
      }
      return { success: true as const };
    },
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

  const { data: refreshData, error: refreshError } = await mfaClient.auth.refreshSession({
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

/**
 * Records that a two-factor sign-in finished. Best-effort, and a 401 never
 * starts a teardown: the sign-in itself has already succeeded.
 */
export async function recordMobileSignInCompleted(accessToken: string): Promise<void> {
  const init: RequestInit = { method: "POST" };
  try {
    await mobileRequest(
      "/api/mobile/v1/auth/sign-in-complete",
      { ...init, headers: createHeaders(init, { Authorization: `Bearer ${accessToken}` }) },
      (value) => mfaMutationResponseSchema.parse(value),
      null,
    );
  } catch {
    // Audit only.
  }
}

export function registerMobileSessionPresence(accessToken: string): Promise<{ success: true }> {
  const platform = getNativeSessionPlatform();
  if (!platform) {
    return Promise.resolve({ success: true });
  }

  const metadata = getNativeSessionMetadata(
    platform,
    Device.modelName,
    Constants.expoConfig?.version,
  );

  return mobileApiRequest(
    "/api/mobile/v1/session-presence",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        platform,
        deviceLabel: metadata.deviceLabel,
        ...(metadata.appVersion ? { appVersion: metadata.appVersion } : {}),
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

export function getNativeSessionMetadata(
  platform: "ios" | "android",
  modelName: string | null | undefined,
  appVersion: string | null | undefined,
): { deviceLabel: string; appVersion: string | null } {
  return {
    deviceLabel: modelName?.trim() || (platform === "ios" ? "iPhone" : "Android device"),
    appVersion: appVersion?.trim() || null,
  };
}

export function getMySchedule(
  accessToken: string,
  query?: MobileScheduleRange,
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/me/schedule", query),
    accessToken,
    { method: "GET", signal },
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
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/org/schedule", query),
    accessToken,
    { method: "GET", signal },
    (value) => mobileOrgScheduleResponseSchema.parse(value),
  );
}

export function getDashboard(
  accessToken: string,
  query?: MobileScheduleRange,
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/dashboard", query),
    accessToken,
    { method: "GET", signal },
    (value) => mobileDashboardResponseSchema.parse(value),
  );
}

export function getShiftRequests(
  accessToken: string,
  query?: MobileScheduleRange,
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/shift-requests", query),
    accessToken,
    { method: "GET", signal },
    (value) => mobileShiftRequestsResponseSchema.parse(value),
  );
}

export function getShiftRequestHistory(
  accessToken: string,
  query?: {
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  },
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    appendQueryParams("/api/mobile/v1/shift-requests/history", {
      limit: query?.limit?.toString(),
      cursorCreatedAt: query?.cursorCreatedAt,
      cursorId: query?.cursorId,
    }),
    accessToken,
    { method: "GET", signal },
    (value) => mobileShiftRequestHistoryResponseSchema.parse(value),
  );
}

export function getShiftSwapOptions(
  accessToken: string,
  query: MobileScheduleRange & {
    requesterEmpId: string;
    requesterShiftDate: string;
  },
  signal?: AbortSignal,
) {
  return mobileApiRequest(
    withQuery("/api/mobile/v1/shift-requests/swap-options", query),
    accessToken,
    { method: "GET", signal },
    (value) => mobileShiftSwapOptionsResponseSchema.parse(value),
  );
}

export function createShiftRequest(accessToken: string, body: MobileCreateShiftRequestBody) {
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

export type MobileNotificationsListParams = {
  /** One alert by id, for a deep link that may name an older one. */
  id?: string;
  limit?: number;
  cursorCreatedAt?: string;
  cursorId?: string;
  category?: string;
  type?: string;
  priority?: "low" | "normal" | "high" | "critical";
  read?: "unread" | "read";
  search?: string;
  archived?: "inbox" | "archived" | "any";
  sort?: "asc" | "desc";
};

export function getNotifications(
  accessToken: string,
  params: MobileNotificationsListParams = {},
  signal?: AbortSignal,
) {
  const query: Record<string, string | undefined> = {
    id: params.id,
    limit: params.limit ? String(params.limit) : undefined,
    cursorCreatedAt: params.cursorCreatedAt,
    cursorId: params.cursorId,
    category: params.category,
    type: params.type,
    priority: params.priority,
    read: params.read,
    search: params.search,
    archived: params.archived,
    sort: params.sort,
  };
  return mobileApiRequest(
    appendQueryParams("/api/mobile/v1/notifications", query),
    accessToken,
    { method: "GET", signal },
    (value) => mobileNotificationsResponseSchema.parse(value),
  );
}

export function markNotificationRead(accessToken: string, notificationId: string) {
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

export function getNotificationFacets(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/notifications/facets",
    accessToken,
    { method: "GET", signal },
    (value) => mobileNotificationFacetsSchema.parse(value),
  );
}

export function bulkUpdateNotifications(
  accessToken: string,
  body: {
    ids: string[];
    action: "read" | "unread" | "archive" | "unarchive";
  },
) {
  return mobileApiRequest(
    "/api/mobile/v1/notifications/actions",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobileNotificationBulkResponseSchema.parse(value),
  );
}

export function getPeople(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest(
    "/api/mobile/v1/people",
    accessToken,
    { method: "GET", signal },
    (value) => mobilePeopleResponseSchema.parse(value),
  );
}

export function createMobilePerson(accessToken: string, body: MobilePersonCreateBody) {
  return mobileApiRequest(
    "/api/mobile/v1/people",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonCreateResponseSchema.parse(value),
  );
}

export type MobileContactCheckResult = {
  email: { conflict: boolean; reason?: MobileContactConflictReason } | null;
  phone: { conflict: boolean } | null;
};

/**
 * Pre-flight duplicate check for the add and edit person forms. Callers treat a
 * failure as "no conflict found": a flaky check must never be what stops a
 * legitimate save, and the 409 on submit is still there as the real gate.
 */
export function checkMobilePersonContact(
  accessToken: string,
  body: {
    email?: string;
    phone?: string;
    excludeEmployeeId?: string;
    currentUserId?: string | null;
  },
) {
  return mobileApiRequest(
    "/api/mobile/v1/people/contact-check",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => value as MobileContactCheckResult,
  );
}

export function getMobilePerson(accessToken: string, personId: string, signal?: AbortSignal) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}`,
    accessToken,
    { method: "GET", signal },
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

/**
 * The org role on its own. Separate from management access on purpose: the
 * access badge on a person's profile sets the role without touching whichever
 * departments they manage.
 */
export function changeMobilePersonOrgRole(
  accessToken: string,
  personId: string,
  body: MobilePersonOrgRoleBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/access`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    (value) => mobilePersonOrgRoleResponseSchema.parse(value),
  );
}

export function updateMobilePersonManagementAccess(
  accessToken: string,
  personId: string,
  body: MobileManagementAccessBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/management-access`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementAccessResponseSchema.parse(value),
  );
}

export function removeMobilePersonManagementAccess(
  accessToken: string,
  personId: string,
  body: MobileManagementAccessRemoveBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/people/${personId}/management-access`,
    accessToken,
    {
      method: "DELETE",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementAccessResponseSchema.parse(value),
  );
}

export function getManagementUsers(accessToken: string, signal?: AbortSignal) {
  return mobileApiRequest("/api/mobile/v1/management-users", accessToken, { signal }, (value) =>
    mobileManagementUsersResponseSchema.parse(value),
  );
}

export function inviteMobileManagementUser(
  accessToken: string,
  body: MobileManagementUserInviteBody,
) {
  return mobileApiRequest(
    "/api/mobile/v1/management-users",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementUserResponseSchema.parse(value),
  );
}

export function updateMobileManagementUser(
  accessToken: string,
  personId: string,
  body: MobileManagementUserUpdateBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/management-users/${encodeURIComponent(personId)}`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementUserResponseSchema.parse(value),
  );
}

export function removeMobileManagementUser(
  accessToken: string,
  personId: string,
  body: MobileManagementUserRemoveBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/management-users/${encodeURIComponent(personId)}`,
    accessToken,
    {
      method: "DELETE",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementUserResponseSchema.parse(value),
  );
}

export function updateMobileManagementUserInvitation(
  accessToken: string,
  personId: string,
  body: MobileManagementUserInvitationActionBody,
) {
  return mobileApiRequest(
    `/api/mobile/v1/management-users/${encodeURIComponent(personId)}/invitation`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    (value) => mobileManagementUserResponseSchema.parse(value),
  );
}

/**
 * Stops pushes to this device during a teardown. A 401 here never starts a
 * teardown: the caller is the teardown, and re-entering it used to stall every
 * forced sign-out for five seconds while it waited on itself (41d1).
 */
export function disablePushToken(
  accessToken: string,
  device: { platform: "ios" | "android"; expoPushToken: string },
) {
  const init: RequestInit = {
    method: "POST",
    body: JSON.stringify({ ...device, disabled: true }),
  };
  return mobileRequest(
    "/api/mobile/v1/push-tokens",
    {
      ...init,
      headers: createHeaders(init, {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      }),
    },
    (value) => mobilePushTokenResponseSchema.parse(value),
    null,
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
