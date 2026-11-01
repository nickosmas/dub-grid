import { useEffect, useRef, type ReactElement } from "react";
import { Button, ConfirmationDialog, Host, RNHostView, Text } from "@expo/ui/swift-ui";
import type { AnchoredConfirmationRequest } from "./anchored-confirmation";

/**
 * SwiftUI's confirmation dialog attached to the button that asked for it,
 * which iOS 26 opens as a glass popover from that button, as Contacts does
 * when its X would discard an edit (owner, 2026-10-31). Closing it any way but
 * the action is the cancel.
 */
export function AnchoredConfirmation({
  request,
  children,
}: {
  request: AnchoredConfirmationRequest | null;
  children: ReactElement;
}) {
  // The dialog animates out after the request clears, so it keeps the last
  // words it showed.
  const latest = useRef(request);
  if (request) latest.current = request;
  const answered = useRef(false);
  useEffect(() => {
    if (request) answered.current = false;
  }, [request]);
  const shown = latest.current;

  return (
    <Host matchContents>
      <ConfirmationDialog
        isPresented={request != null}
        onIsPresentedChange={(presented) => {
          if (presented || answered.current) return;
          answered.current = true;
          latest.current?.onCancel();
        }}
        title={shown?.title ?? ""}
        titleVisibility="visible"
      >
        <ConfirmationDialog.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <Button
            label={shown?.confirmLabel ?? ""}
            onPress={() => {
              answered.current = true;
              latest.current?.onConfirm();
            }}
            role="destructive"
          />
        </ConfirmationDialog.Actions>
        {shown?.body ? (
          <ConfirmationDialog.Message>
            <Text>{shown.body}</Text>
          </ConfirmationDialog.Message>
        ) : null}
      </ConfirmationDialog>
    </Host>
  );
}
