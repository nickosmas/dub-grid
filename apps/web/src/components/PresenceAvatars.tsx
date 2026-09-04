"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OnlineUser } from "@/hooks/useSchedulePresence";
import { getAvatarInitials } from "@/lib/utils";
import { useAvatarTone } from "@/hooks/useAvatarTone";

const MAX_VISIBLE = 4;
/** Grace for the pointer to travel from the label onto the card without it closing. */
const ROSTER_CLOSE_DELAY_MS = 160;

/** Extra detail the roster card shows when it has been loaded for a user. */
export interface PresenceProfile {
  orgRole?: string | null;
  email?: string | null;
}

interface PresenceAvatarsProps {
  onlineUsers: OnlineUser[];
  profiles?: Map<string, PresenceProfile>;
  /** Called when the roster opens, so profile detail can be fetched on demand. */
  onRosterOpen?: () => void;
}

function displayPresenceName(user: OnlineUser): string {
  return user.userName;
}

function Avatar({
  user,
  size,
  showStatusDot,
}: {
  user: OnlineUser;
  size: number;
  showStatusDot: boolean;
}) {
  const tone = useAvatarTone(user.userId);
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: "50%",
        background: tone.backgroundColor,
        border: `1px solid ${tone.borderColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 700,
        color: tone.textColor,
        flexShrink: 0,
      }}
    >
      {getAvatarInitials(user.userName)}
      {showStatusDot && (
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
      )}
    </div>
  );
}

// Viewing/editing is deliberately not surfaced: presence only marks a cell as
// being edited while an edit panel is open, so plenty of real editing reads as
// "viewing". Reinstate once presence tracks activity rather than panel state.

export default function PresenceAvatars({
  onlineUsers,
  profiles,
  onRosterOpen,
}: PresenceAvatarsProps) {
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterPos, setRosterPos] = useState<{ x: number; y: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelRef = useRef<HTMLButtonElement | null>(null);

  const cancelClose = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openRoster = useCallback(() => {
    cancelClose();
    const rect = labelRef.current?.getBoundingClientRect();
    if (rect) setRosterPos({ x: rect.left, y: rect.bottom });
    setRosterOpen((wasOpen) => {
      if (!wasOpen) onRosterOpen?.();
      return true;
    });
  }, [cancelClose, onRosterOpen]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setRosterOpen(false);
    }, ROSTER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (!rosterOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelClose();
        setRosterOpen(false);
        labelRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rosterOpen, cancelClose]);

  const otherUsers = onlineUsers.filter((user) => !user.isSameUser);

  if (otherUsers.length === 0) return null;

  const visible = otherUsers.slice(0, MAX_VISIBLE);
  const overflow = otherUsers.length - MAX_VISIBLE;
  const hoveredUserData = otherUsers.find((u) => u.editorSessionId === hoveredUser);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <button
        ref={labelRef}
        type="button"
        aria-expanded={rosterOpen}
        aria-haspopup="dialog"
        onMouseEnter={openRoster}
        onMouseLeave={scheduleClose}
        onFocus={openRoster}
        onBlur={scheduleClose}
        onClick={() => (rosterOpen ? setRosterOpen(false) : openRoster())}
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 600,
          color: "var(--dg-color-text-faint)",
          marginRight: 8,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
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
      </button>

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
            marginLeft: i === 0 ? 0 : -8,
            border: "2px solid var(--dg-color-surface)",
            borderRadius: "50%",
            cursor: "default",
            zIndex: MAX_VISIBLE - i,
          }}
        >
          <Avatar user={user} size={28} showStatusDot />
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

      {rosterOpen &&
        rosterPos &&
        createPortal(
          <div
            role="dialog"
            aria-label="Editors online"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              left: rosterPos.x,
              top: rosterPos.y + 8,
              minWidth: 260,
              maxWidth: 340,
              maxHeight: "60vh",
              overflowY: "auto",
              background: "var(--dg-color-surface)",
              border: "1px solid var(--dg-color-border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
              zIndex: 10000,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
                marginBottom: 8,
              }}
            >
              Editors online
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {otherUsers.map((user) => {
                const profile = profiles?.get(user.userId);
                const details = [profile?.orgRole, profile?.email].filter(Boolean) as string[];
                return (
                  <div
                    key={user.editorSessionId}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    <Avatar user={user} size={28} showStatusDot={false} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-primary)",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {displayPresenceName(user)}
                        </span>
                      </div>

                      {details.length > 0 && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-badge)",
                            color: "var(--dg-color-text-faint)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {details.join(" · ")}
                        </div>
                      )}

                      {user.sessionCount > 1 && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-badge)",
                            color: "var(--dg-color-text-faint)",
                          }}
                        >
                          {`${user.sessionCount} tabs or devices`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
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
