"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { OnlineUser } from "@/hooks/useCellLocks";

const MAX_VISIBLE = 4;

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #38BDF8, #818CF8)",
  "linear-gradient(135deg, #34D399, #06B6D4)",
  "linear-gradient(135deg, #F472B6, #A78BFA)",
  "linear-gradient(135deg, #FB923C, #F472B6)",
  "linear-gradient(135deg, #A78BFA, #38BDF8)",
  "linear-gradient(135deg, #FBBF24, #F97316)",
];

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarGradient(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

interface PresenceAvatarsProps {
  onlineUsers: OnlineUser[];
}

export default function PresenceAvatars({ onlineUsers }: PresenceAvatarsProps) {
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  if (onlineUsers.length === 0) return null;

  const visible = onlineUsers.slice(0, MAX_VISIBLE);
  const overflow = onlineUsers.length - MAX_VISIBLE;
  const hoveredUserData = onlineUsers.find((u) => u.userId === hoveredUser);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--color-text-faint)",
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
            background: "#22C55E",
          }}
        />
        <span role="status">{onlineUsers.length} online</span>
      </span>

      {visible.map((user, i) => (
        <div
          key={user.userId}
          onMouseEnter={(e) => {
            setHoveredUser(user.userId);
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
          }}
          role="img"
          aria-label={user.userName}
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
            color: "#fff",
            flexShrink: 0,
            marginLeft: i === 0 ? 0 : -8,
            border: "2px solid var(--color-surface)",
            cursor: "default",
            zIndex: MAX_VISIBLE - i,
          }}
        >
          {getInitials(user.userName)}
          <span
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: user.editingCell ? "#6366F1" : "#22C55E",
              border: "2px solid var(--color-surface)",
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
            background: "var(--color-surface-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 700,
            color: "var(--color-text-muted)",
            flexShrink: 0,
            marginLeft: -8,
            border: "2px solid var(--color-surface)",
            zIndex: 0,
          }}
        >
          +{overflow}
        </div>
      )}

      {hoveredUser && tooltipPos && hoveredUserData && createPortal(
        <div
          style={{
            position: "fixed",
            left: tooltipPos.x,
            top: tooltipPos.y - 8,
            transform: "translate(-50%, -100%)",
            background: "var(--color-surface)",
            padding: "6px 12px",
            borderRadius: 8,
            boxShadow:
              "0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)",
            zIndex: 1000,
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {hoveredUserData.userName}
          {hoveredUserData.editingCell && (
            <span
              style={{
                fontWeight: 400,
                color: "var(--color-text-muted)",
                marginLeft: 6,
              }}
            >
              editing
            </span>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
