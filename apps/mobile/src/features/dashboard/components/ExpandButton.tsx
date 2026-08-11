import { Button } from "../../../shared/components/Button";

// Mirrors web's ExpandButton (apps/web/src/components/dashboard/ExpandButton.tsx):
// a small icon-only button in a dashboard card's header that opens a full,
// expanded view of that card's content.
export function ExpandButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      icon="expand-outline"
      iconOnly
      onPress={onPress}
      size="sm"
      tone="ghost"
    />
  );
}
