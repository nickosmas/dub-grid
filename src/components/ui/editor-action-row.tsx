import type { CSSProperties, ReactNode } from "react";

interface EditorActionRowProps {
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  destructiveAction?: ReactNode;
  inline?: boolean;
  style?: CSSProperties;
  className?: string;
  gap?: number;
}

export function EditorActionRow({
  primaryAction,
  secondaryAction,
  destructiveAction,
  inline = false,
  style,
  className,
  gap = 8,
}: EditorActionRowProps) {
  const baseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap,
  };

  if (inline) {
    return (
      <div className={className} style={{ ...baseStyle, ...style }}>
        {destructiveAction}
        {secondaryAction}
        {primaryAction}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        ...baseStyle,
        justifyContent: "flex-end",
        ...style,
      }}
    >
      {destructiveAction ? (
        <>
          {destructiveAction}
          <div style={{ flex: 1, minWidth: 0 }} />
        </>
      ) : null}
      {secondaryAction}
      {primaryAction}
    </div>
  );
}
