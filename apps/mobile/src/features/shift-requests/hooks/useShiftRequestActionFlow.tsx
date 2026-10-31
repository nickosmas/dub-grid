import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileOpenShift } from "@dubgrid/contracts";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { updateShiftRequest } from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  getMobileRequestActionFeedback,
  getMobileRequestActionSuccessToast,
  type MobileRequestActionFeedback,
} from "../lib/request-action-feedback";

export type RequestActionBody =
  | { action: "claim"; claimerEmpId: string }
  | {
      action: "volunteer_open_shift";
      empId: string;
      shiftDate: string;
      focusAreaId: number;
      state: MobileOpenShift["state"];
    }
  | { action: "respond"; empId: string; accept: boolean };

export type PendingRequestAction = {
  key: string;
} | null;

type RequestActionConfirmation = {
  requestId: string;
  body: RequestActionBody;
  feedback: MobileRequestActionFeedback;
} | null;

/**
 * Claim, volunteer and respond, each confirmed first, as Home's personal
 * sections run them. `onSucceeded` refetches the screen that asked.
 */
export function useShiftRequestActionFlow({
  accessToken,
  viewerCanApprove,
  onSucceeded,
}: {
  accessToken: string | null;
  viewerCanApprove: boolean;
  onSucceeded: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [pendingAction, setPendingAction] = useState<PendingRequestAction>(null);
  const [confirmation, setConfirmation] = useState<RequestActionConfirmation>(null);
  const mutation = useMutation({
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Couldn't update request",
        fallbackMessage: "We couldn't update that shift request right now.",
      });
    },
    onSuccess: async (data, variables) => {
      await Promise.all([
        onSucceeded(),
        queryClient.invalidateQueries({
          queryKey: ["mobile", "requests"],
        }),
      ]);
      pushToast({
        tone: "success",
        ...getMobileRequestActionSuccessToast(variables.body, data),
      });
    },
  });

  const runRequestAction = useCallback(
    (requestId: string, body: RequestActionBody) => {
      if (mutation.isPending || pendingAction) {
        return;
      }

      const feedback = getMobileRequestActionFeedback({ requestId, body, viewerCanApprove });
      setConfirmation({ requestId, body, feedback });
    },
    [viewerCanApprove, pendingAction, mutation.isPending],
  );

  const confirmRequestAction = useCallback(() => {
    if (!confirmation) return;

    const { requestId, body, feedback } = confirmation;
    setConfirmation(null);
    setPendingAction({ key: feedback.key });
    // Returned so `ConfirmationModal` can latch on it. The guard above reads
    // state that a same-tick second tap has not seen cleared yet, so without
    // the promise a double-tap approves the request twice. Settling resolves
    // rather than rejects: the mutation's own `onError` already toasts.
    return new Promise<void>((resolve) => {
      mutation.mutate(
        { requestId, body },
        {
          onSettled: () => {
            setPendingAction(null);
            resolve();
          },
        },
      );
    });
  }, [confirmation, mutation]);

  const confirmationModal = (
    <ConfirmationModal
      body={confirmation?.feedback.message}
      confirmLabel={confirmation?.feedback.confirmLabel ?? "Confirm"}
      confirmTone={confirmation?.feedback.confirmStyle === "destructive" ? "danger" : "primary"}
      onCancel={() => setConfirmation(null)}
      onConfirm={confirmRequestAction}
      title={confirmation?.feedback.title ?? "Confirm action?"}
      visible={Boolean(confirmation)}
    />
  );

  return { pendingAction, runRequestAction, confirmationModal };
}
