import { View } from "react-native";
import { Button } from "./Button";
import { Card } from "./Screen";

export function QueryStateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Card title={title} body={body} />
      {actionLabel && onAction ? <Button compact label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
