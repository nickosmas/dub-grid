"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { OnlineUser } from "@/hooks/useCellLocks";
import { getAvatarInitials } from "@/lib/utils";
import { getAvatarGradientTone } from "@dubgrid/design-tokens";

const MAX_VISIBLE = 4;

function avatarGradient(userId: string): string {
  const tone = getAvatarGradientTone(userId);
  return `linear-gradient(135deg, ${tone.gradientFrom}, ${tone.gradientTo})`;
}

interface PresenceAvatarsProps {
  onlineUsers: OnlineUser[];
}

function displayPresenceName(user: OnlineUser): string {
  return user.userName;
}

export default function PresenceAvatars({ onlineUsers }: PresenceAvatarsProps) {
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const otherUsers = onlineUsers.filter((user) => !user.isSameUser);

  if (otherUsers.length === 0) return null;

  const visible = otherUsers.slice(0, MAX_VISIBLE);
  const overflow = otherUsers.length - MAX_VISIBLE;
  const hoveredUserData = otherUsers.find((u) => u.editorSessionId === hoveredUser);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--dg-color-text-faint)",
          marginRight: 8,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--dg-color-success)",
          }}
        />
        <span role="status">{otherUsers.length} online</span>
      </span>

      {visible.map((user, i) => (
        <div
          key={user.editorSessionId}
          onMouseEnter={(e) => {
            setHoveredUser(user.editorSessionId);
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
          }}
          role="img"
          aria-label={displayPresenceName(user)}
          onMouseLeave={() => {
            setHoveredUser(null);
            setTooltipPos(null);
          }}
          style={{
            position: "relative",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: avatarGradient(user.userId),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 700,
            color: "var(--dg-color-text-inverse)",
            flexShrink: 0,
            marginLeft: i === 0 ? 0 : -8,
            border: "2px solid var(--dg-color-surface)",
            cursor: "default",
            zIndex: MAX_VISIBLE - i,
          }}
        >
          {getAvatarInitials(user.userName)}
          <span
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: user.editingCell ? "var(--dg-color-brand)" : "var(--dg-color-success)",
              border: "2px solid var(--dg-color-surface)",
            }}
          />
        </div>
      ))}

      {overflow > 0 && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--dg-color-bg-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 700,
            color: "var(--dg-color-text-muted)",
            flexShrink: 0,
            marginLeft: -8,
            border: "2px solid var(--dg-color-surface)",
            zIndex: 0,
          }}
        >
          +{overflow}
        </div>
      )}

      {hoveredUser &&
        tooltipPos &&
        hoveredUserData &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: tooltipPos.x,
              top: tooltipPos.y - 8,
              transform: "translate(-50%, -100%)",
              background: "var(--dg-color-surface)",
              padding: "6px 12px",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)",
              zIndex: 10000,
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {displayPresenceName(hoveredUserData)}
            {hoveredUserData.editingCell && (
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--dg-color-text-muted)",
                  marginLeft: 6,
                }}
              >
                editing
              </span>
            )}
            {hoveredUserData.sessionCount > 1 && (
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--dg-color-text-muted)",
                  marginLeft: 6,
                }}
              >
                {`${hoveredUserData.sessionCount} sessions`}
              </span>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
