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
    <Card
      title={title}
      body={body}
      detail={
        actionLabel && onAction ? (
          <Button compact label={actionLabel} onPress={onAction} />
        ) : undefined
      }
    />
  );
}
