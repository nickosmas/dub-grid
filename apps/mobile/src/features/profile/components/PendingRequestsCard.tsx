import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileProfileChangeRequest } from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { ProfileList, ProfileListAction, ProfileSection } from "./ProfilePrimitives";
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
  profile_update: "An Admin reviews it before your name changes.",
  account_deletion: "An Admin reviews it before your account is deleted.",
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

  if (IS_NATIVE_LIST) {
    // A grouped section: the count as its header, each request a row of what
    // it is with Cancel request under it in red, as Settings lists a pending
    // change with its own way out.
    return (
      <ProfileSection
        description="Waiting on admin review. You can cancel a request anytime."
        title={countLabel}
      >
        <ProfileList>
          {requests.map((request, index) => (
            <View key={request.id}>
              <View style={styles.nativeRow}>
                <Text style={styles.nativeRowTitle}>{TYPE_LABELS[request.type]}</Text>
                <Text style={styles.rowDescription}>{TYPE_DESCRIPTIONS[request.type]}</Text>
                <Text style={styles.rowMeta}>Submitted {formatSubmittedAt(request.createdAt)}</Text>
                <View style={styles.nativeDivider} />
              </View>
              <ProfileListAction
                isLast={index === requests.length - 1}
                label="Cancel request"
                loading={cancellingId === request.id}
                onPress={() => onCancel(request)}
                tone="danger"
              />
            </View>
          ))}
        </ProfileList>
      </ProfileSection>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons color={mobileColors.warningText} name="time" size={24} style={styles.icon} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{countLabel}</Text>
          <Text style={styles.subtitle}>
            Waiting on admin review. You can cancel a request anytime.
          </Text>
        </View>
      </View>

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
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: 16,
    },
    header: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
    },
    icon: {
      flexShrink: 0,
      marginTop: 1,
    },
    headerCopy: {
      flex: 1,
      gap: 4,
    },
    title: {
      ...mobileText.cardTitle,
      color: mobileColors.warningText,
    },
    subtitle: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    list: {
      gap: mobileSpace.md,
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
    nativeRow: {
      gap: mobileSpace.xs,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    nativeRowTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    nativeDivider: {
      backgroundColor: mobileColors.borderSubtle,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      left: 16,
      position: "absolute",
      right: 0,
    },
  });
