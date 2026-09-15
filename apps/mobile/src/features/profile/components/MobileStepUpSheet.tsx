import { useRef, useState } from "react";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import type { MobileStepUpMethod } from "../lib/step-up";
import { ProfileTextInput } from "./ProfilePrimitives";

export function MobileStepUpSheet({
  method,
  error,
  onConfirm,
  onCancel,
}: {
  method: MobileStepUpMethod;
  error: string | null;
  onConfirm: (credential: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [credential, setCredential] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);
  const isPassword = method === "password";
  const canSubmit = isPassword ? credential.length > 0 : /^\d{6}$/.test(credential);

  async function submit() {
    if (inFlight.current || !canSubmit) return;
    inFlight.current = true;
    setIsBusy(true);
    const value = credential;
    setCredential("");
    try {
      await onConfirm(value);
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  }

  return (
    <BottomSheetModal
      accessibilityLabel="Confirm identity"
      accessibilityRole="alert"
      debugName="Mobile identity confirmation"
      dismissDisabled={isBusy}
      footer={
        <SheetActions
          primaryAction={<Button disabled={!canSubmit} label="Continue" onPress={submit} />}
        >
          <Button
            disabled={isBusy}
            label="Cancel"
            tone="secondary"
            onPress={() => {
              if (!inFlight.current) onCancel();
            }}
          />
        </SheetActions>
      }
      header={<SheetHeader title="Confirm your identity" />}
      visible
      onDismiss={() => {
        if (!inFlight.current) onCancel();
      }}
    >
      <ProfileTextInput
        autoCapitalize="none"
        autoComplete={isPassword ? "current-password" : "one-time-code"}
        autoCorrect={false}
        error={error}
        keyboardType={isPassword ? "default" : "number-pad"}
        label={isPassword ? "Password" : "Authenticator code"}
        maxLength={isPassword ? 1024 : 6}
        placeholder={isPassword ? "Enter your password" : "Enter six-digit code"}
        secureTextEntry={isPassword}
        value={credential}
        onChangeText={(value) =>
          setCredential(isPassword ? value : value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </BottomSheetModal>
  );
}
