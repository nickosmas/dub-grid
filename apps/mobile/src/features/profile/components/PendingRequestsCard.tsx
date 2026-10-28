import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileProfileChangeRequest } from "@dubgrid/contracts";
import { Banner } from "../../../shared/components/Banner";
import { Button } from "../../../shared/components/Button";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileText,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";

const TYPE_LABELS: Record<MobileProfileChangeRequest["type"], string> = {
  profile_update: "Name change",
  account_deletion: "Account deletion",
};

const TYPE_DESCRIPTIONS: Record<MobileProfileChangeRequest["type"], string> = {
  profile_update: "An admin will review and update your name once approved.",
  account_deletion: "An admin will review and remove your account once approved.",
};

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PendingRequestsCard({
  requests,
  cancellingId,
  onCancel,
}: {
  requests: MobileProfileChangeRequest[];
  cancellingId: string | null;
  onCancel: (request: MobileProfileChangeRequest) => Promise<unknown>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  if (requests.length === 0) return null;

  const countLabel =
    requests.length === 1 ? "1 pending request" : `${requests.length} pending requests`;

  return (
    <Banner icon="time-outline" title={countLabel} tone="warning">
      Waiting on admin review. You can cancel a request anytime.
      <View style={styles.list}>
        {requests.map((request) => {
          const isCancelling = cancellingId === request.id;
          return (
            <View key={request.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{TYPE_LABELS[request.type]}</Text>
                <Text style={styles.rowDescription}>{TYPE_DESCRIPTIONS[request.type]}</Text>
                <Text style={styles.rowMeta}>Submitted {formatSubmittedAt(request.createdAt)}</Text>
              </View>
              <View style={styles.rowAction}>
                <Button
                  compact
                  label="Cancel request"
                  loading={isCancelling}
                  onPress={() => onCancel(request)}
                  tone="secondary"
                />
              </View>
            </View>
          );
        })}
      </View>
    </Banner>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    list: {
      gap: mobileSpace.md,
      marginTop: mobileSpace.sm,
    },
    row: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.border,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: 12,
    },
    rowCopy: {
      gap: mobileSpace.xs,
    },
    rowTitle: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
    },
    rowDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    rowMeta: {
      ...mobileText.meta,
      color: mobileColors.textSubtle,
    },
    rowAction: {
      alignItems: "flex-start",
    },
  });
