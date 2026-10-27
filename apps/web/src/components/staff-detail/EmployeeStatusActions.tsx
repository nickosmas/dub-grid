"use client";

import { useRef, useState } from "react";
import type { AbsenceType, Employee } from "@/types";
import { Button } from "@/components/Button";
import { addDays, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog, { ConfirmSummaryBox } from "@/components/ConfirmDialog";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import CustomSelect from "@/components/CustomSelect";
import { RadioCardList } from "@/components/ui/radio-card-list";
import type { PlannedAway } from "@/features/employees/client";
import { CalendarDays, Ellipsis } from "lucide-react";
import {
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  describeStatusAction,
  describeStatusCard,
  PLANNED_START_MAX_DAYS,
  statusChoices,
  suggestedStatusChoice,
  type StatusAction,
  type StatusCardCopy,
} from "@dubgrid/domain";
import { STATUS_KIND_ICONS, STATUS_TONE_COLORS, StatusIconCircle } from "./StatusMarkIcon";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  onDeactivate: (
    empId: string,
    note?: string,
    returnDate?: string,
    absenceTypeId?: number | null,
    startDate?: string,
  ) => void | Promise<unknown>;
  onActivate: (empId: string) => void | Promise<unknown>;
  /**
   * Sets, moves or clears (null) an Away person's return date and the absence
   * their days hold; hidden when absent.
   */
  onSetReturnDate?: (
    empId: string,
    returnDate: string | null,
    absenceTypeId?: number | null,
  ) => void | Promise<unknown>;
  /** Gives a suspended person their access back (51c); not offered when absent. */
  onReinstate?: (empId: string) => void | Promise<unknown>;
  /** Suspends someone's access (51c); not offered when absent. */
  onSuspend?: (empId: string) => void | Promise<unknown>;
  /** Moves or changes a planned Away, or cancels it (null) (51g1); not offered when absent. */
  onSetPlannedAway?: (empId: string, plan: PlannedAway | null) => void | Promise<unknown>;
  /** Live absence types; with a return date, one can fill the away days (51f). */
  absenceTypes?: readonly AbsenceType[];
  onRemove: (empId: string, note?: string) => void | Promise<unknown>;
  variant: "panel" | "page" | "card" | "card-quiet";
  /** The button's label; Edit plan opens the same dialog from the planned card. */
  label?: string;
  /** Opens a confirmation for this change alone, as the card's Reinstate does. */
  initialChoice?: StatusAction;
  /** Left out of the list because a button beside this one already offers it. */
  excludeChoice?: StatusAction;
  /**
   * For someone with an away planned: Edit plan opens its dates alone, and
   * Change status the list alone, so the two never offer the same thing.
   */
  focus?: "plan" | "status";
  /**
   * Opens the dialog at once with no button of its own, for a menu item that
   * names its change; `onClosed` lets the menu's owner unmount it.
   */
  startOpen?: boolean;
  onClosed?: () => void;
  /** Stretches the button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
  /** Hides the confirmation while a step-up prompt asks for fresh proof. */
  stepUpOpen?: boolean;
}

const RETURN_DATE_HINT =
  "They're back to Active on this day. Leave it empty to mark them active yourself.";

function ReturnDateField({
  value,
  minDate,
  onChange,
}: {
  value: string;
  minDate: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Return date
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Return date"
        placeholder="No return date"
        minDate={minDate}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {RETURN_DATE_HINT}
      </span>
    </div>
  );
}

/** The first day away; empty means today, and a later day plans it (51g1). */
function StartDateField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Starts
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Starts"
        placeholder="Today"
        minDate={formatDateKey(new Date())}
        maxDate={formatDateKey(addDays(new Date(), PLANNED_START_MAX_DAYS))}
        allowClear
      />
      {hint ? (
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const NO_ABSENCE = 0;

const AWAY_ABSENCE_HINT =
  "Every day until they're back shows this absence in the draft. Leave it as No absence to keep those days empty.";

function AwayAbsenceField({
  value,
  absenceTypes,
  onChange,
  disabled = false,
}: {
  value: number;
  absenceTypes: readonly AbsenceType[];
  onChange: (value: number) => void;
  /** Until there's a return date: the absence fills the days up to it. */
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Absence
      </span>
      <CustomSelect
        ariaLabel="Absence"
        disabled={disabled}
        value={value}
        options={[
          { value: NO_ABSENCE, label: "No absence" },
          ...absenceTypes.map((absenceType) => ({
            value: absenceType.id,
            label: absenceType.name,
          })),
        ]}
        onChange={onChange}
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {disabled ? AWAY_ABSENCE_NEEDS_DATE_MESSAGE : AWAY_ABSENCE_HINT}
      </span>
    </div>
  );
}

/** The tint of the status each choice leads to. */
const CHOICE_TONES = {
  active: "success",
  away: "warning",
  suspended: "danger",
  archived: "neutral",
} as const;

const NOTE_PLACEHOLDERS: Partial<Record<StatusAction, string>> = {
  markAway: "Reason (optional) - e.g. Family leave",
  archive: "Reason (optional) - e.g. Left the company",
};

const LABEL_STYLE = {
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 600,
  color: "var(--dg-color-text-secondary)",
} as const;

/** Where they stand, at the top of the dialog: the profile's status card, without its tint. */
function CurrentStatusCard({ card }: { card: StatusCardCopy }) {
  const { current, planned } = card;
  const titleColor =
    current.kind === "active"
      ? "var(--dg-color-text-primary)"
      : STATUS_TONE_COLORS[current.tone].text;
  return (
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--dg-radius-lg)",
          border: "1px solid var(--dg-color-border)",
          background: "var(--dg-color-surface)",
        }}
      >
        <StatusIconCircle icon={STATUS_KIND_ICONS[current.kind]} tone={current.tone} size={30} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span
            className="dg-tabular-nums"
            style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: titleColor }}
          >
            {current.title}
          </span>
          <span
            className="dg-tabular-nums"
            style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
          >
            {current.detail}
          </span>
        </span>
      </div>
      {planned ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: "var(--dg-radius-lg)",
            border: `1px dashed ${STATUS_TONE_COLORS.warning.border}`,
          }}
        >
          <StatusIconCircle icon={CalendarDays} tone="warning" size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: STATUS_TONE_COLORS.warning.text,
              }}
            >
              {`Planned: ${planned.title}`}
            </span>
            <span
              className="dg-tabular-nums"
              style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
            >
              {planned.detail}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every status change goes through one Change status button and one dialog
 * (51d): a card at the top says where they stand, the list holds only the
 * statuses they can move to, the title and confirm button name what happens,
 * and what changes is kept apart from what stays the same. With one status to
 * move to, or opened from a button that names its change, there is no list,
 * only a sentence saying what it does.
 */
export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  onDeactivate,
  onActivate,
  onRemove,
  onSetReturnDate,
  onReinstate,
  onSuspend,
  onSetPlannedAway,
  absenceTypes = [],
  variant,
  label = "Change status",
  initialChoice,
  excludeChoice,
  focus,
  startOpen = false,
  onClosed,
  fillWidth = false,
  stepUpOpen = false,
}: EmployeeStatusActionsProps) {
  const hasPlan =
    employee.status === "active" && employee.plannedStatus === "away" && !!employee.plannedFrom;
  // Someone Away edits their return date here; someone with an Away planned
  // edits the plan's dates (51g1). Both start from what they have.
  const initialReturnDate = (hasPlan ? employee.plannedUntil : employee.awayUntil) ?? "";
  const initialAbsenceTypeId =
    (hasPlan ? employee.plannedAbsenceTypeId : employee.awayAbsenceTypeId) ?? NO_ABSENCE;
  const initialStartDate = hasPlan ? (employee.plannedFrom ?? "") : "";
  const [open, setOpen] = useState(startOpen);
  const [choice, setChoice] = useState<StatusAction | null>(
    startOpen ? (initialChoice ?? null) : null,
  );
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [absenceTypeId, setAbsenceTypeId] = useState(initialAbsenceTypeId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  // The dialog unmounts while a step-up prompt shows, which drops its own
  // latch, so the pending state lives here to survive the round trip.
  const [pending, setPending] = useState(false);

  // Self-action guard: you can't change your own status, so callers hide this
  // whole section rather than show it with nothing actionable inside.
  if (!canEdit || isSelf) return null;

  const displayName = getEmployeeDisplayName(employee);
  const isAway = employee.status === "inactive" && !employee.archivedAt;
  const handlers: Partial<Record<StatusAction, unknown>> = {
    suspend: onSuspend,
    reinstate: onReinstate,
  };
  const todayKey = formatDateKey(new Date());
  // A start after today plans the Away rather than starting it.
  const laterStart = startDate && startDate > todayKey ? startDate : null;
  const returnMinDate = formatDateKey(
    addDays(laterStart ? new Date(`${laterStart}T00:00:00`) : new Date(), 1),
  );
  const choices = statusChoices(employee).filter(
    (option) =>
      option.action !== excludeChoice &&
      (!(option.action in handlers) || Boolean(handlers[option.action])),
  );
  // One status to move to, or a card button that names its own change
  // (Reinstate, Restore): a confirmation for that change alone, with no list.
  const onlyChoice =
    focus === "plan"
      ? null
      : choices.length === 1 && !excludeChoice
        ? choices[0]
        : initialChoice
          ? (choices.find((option) => option.action === initialChoice) ?? null)
          : null;

  // The absence only applies with a return date, so it goes when the date does.
  const chosenAbsenceTypeId = returnDate && absenceTypeId !== NO_ABSENCE ? absenceTypeId : null;
  const chosenAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === chosenAbsenceTypeId)?.name ?? null;
  const awayDetailsChanged =
    isAway &&
    ((returnDate || null) !== (employee.awayUntil ?? null) ||
      chosenAbsenceTypeId !== (employee.awayAbsenceTypeId ?? null));
  const planChanged =
    hasPlan &&
    !cancellingPlan &&
    !!laterStart &&
    (laterStart !== employee.plannedFrom ||
      (returnDate || null) !== (employee.plannedUntil ?? null) ||
      chosenAbsenceTypeId !== (employee.plannedAbsenceTypeId ?? null));
  // Clearing a planned away's start date starts it today instead.
  const startsNow = hasPlan && !cancellingPlan && !startDate && focus !== "status";
  const plannedAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === employee.plannedAbsenceTypeId)?.name ??
    null;
  const statusCard = describeStatusCard(employee, {
    absenceName: isAway
      ? absenceTypes.find((absenceType) => absenceType.id === employee.awayAbsenceTypeId)?.name
      : plannedAbsenceName,
  });
  const datedFields = (
    <>
      <ReturnDateField value={returnDate} minDate={returnMinDate} onChange={setReturnDate} />
      {absenceTypes.length > 0 ? (
        <AwayAbsenceField
          value={chosenAbsenceTypeId ?? NO_ABSENCE}
          absenceTypes={absenceTypes}
          onChange={setAbsenceTypeId}
          disabled={!returnDate}
        />
      ) : null}
    </>
  );

  function reset() {
    setChoice(onlyChoice?.action ?? null);
    setNote("");
    setReturnDate(initialReturnDate);
    setAbsenceTypeId(initialAbsenceTypeId);
    setStartDate(initialStartDate);
    setCancellingPlan(false);
  }

  function close() {
    setOpen(false);
    reset();
    onClosed?.();
  }

  async function confirm() {
    const trimmedNote = note.trim() || undefined;
    setPending(true);
    try {
      switch (choice) {
        case null:
          if (startsNow) {
            await (returnDate
              ? onDeactivate(employee.id, undefined, returnDate, chosenAbsenceTypeId)
              : onDeactivate(employee.id));
          } else if (hasPlan) {
            await onSetPlannedAway?.(
              employee.id,
              cancellingPlan || !laterStart
                ? null
                : {
                    startDate: laterStart,
                    returnDate: returnDate || null,
                    absenceTypeId: chosenAbsenceTypeId,
                  },
            );
          } else {
            await onSetReturnDate?.(employee.id, returnDate || null, chosenAbsenceTypeId);
          }
          break;
        case "markAway":
          await (laterStart
            ? onDeactivate(
                employee.id,
                trimmedNote,
                returnDate || undefined,
                chosenAbsenceTypeId,
                laterStart,
              )
            : returnDate
              ? onDeactivate(employee.id, trimmedNote, returnDate, chosenAbsenceTypeId)
              : onDeactivate(employee.id, trimmedNote));
          break;
        // Revoking any linked org membership happens server-side, atomically
        // with the status change (see /api/employees/status).
        case "archive":
          await onRemove(employee.id, trimmedNote);
          break;
        case "suspend":
          await onSuspend?.(employee.id);
          break;
        case "reinstate":
          await onReinstate?.(employee.id);
          break;
        default:
          await onActivate(employee.id);
      }
    } finally {
      setPending(false);
    }
    close();
  }

  const copy = choice
    ? describeStatusAction(choice, displayName, {
        hasAccount: Boolean(employee.userId),
        returnDate: choice === "markAway" ? returnDate || null : null,
        absenceName: choice === "markAway" ? chosenAbsenceName : null,
        startDate: choice === "markAway" ? laterStart : null,
        // Any other change today replaces the plan, and says so.
        plannedFrom:
          hasPlan && !(choice === "markAway" && laterStart) ? employee.plannedFrom : null,
      })
    : startsNow
      ? describeStatusAction("markAway", displayName, {
          hasAccount: Boolean(employee.userId),
          returnDate: returnDate || null,
          absenceName: chosenAbsenceName,
        })
      : cancellingPlan
        ? describeStatusAction("cancelPlannedChange", displayName, {
            absenceName: plannedAbsenceName,
          })
        : planChanged
          ? describeStatusAction("setPlannedChange", displayName, {
              startDate: laterStart,
              returnDate: returnDate || null,
              absenceName: chosenAbsenceName,
            })
          : awayDetailsChanged
            ? describeStatusAction("setReturnDate", displayName, {
                returnDate: returnDate || null,
                currentReturnDate: employee.awayUntil ?? null,
                absenceName: chosenAbsenceName,
              })
            : null;
  const notePlaceholder = choice ? NOTE_PLACEHOLDERS[choice] : undefined;

  const detailsAboveLine = (
    <>
      {isAway && !choice && onSetReturnDate ? datedFields : null}
      {hasPlan && !choice && onSetPlannedAway && focus !== "status" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cancellingPlan ? null : (
            <>
              <StartDateField
                value={startDate}
                onChange={setStartDate}
                hint="Clear it to start their time away today."
              />
              {datedFields}
            </>
          )}
          <Button
            className="dg-btn dg-btn-ghost dg-btn-xs"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setCancellingPlan((value) => !value)}
          >
            {cancellingPlan ? "Keep planned away" : "Cancel planned away"}
          </Button>
        </div>
      ) : null}
    </>
  );
  const ordinary = choice === "markActive" || choice === "reinstate" || choice === "restore";
  const showList = !onlyChoice && focus !== "plan";

  const dialog =
    open && !stepUpOpen ? (
      <ConfirmDialog
        isLoading={pending}
        // Wider than a plain confirm: the status cards carry a line of detail each.
        maxWidth={540}
        title={
          copy?.title ??
          (focus === "plan"
            ? isAway
              ? `Change ${displayName}'s return date?`
              : `Change ${displayName}'s planned away?`
            : `Change ${displayName}'s status?`)
        }
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={
                !showList
                  ? { display: "flex", flexDirection: "column", gap: 14 }
                  : {
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      paddingBottom: 16,
                      borderBottom: "1px solid var(--dg-color-border)",
                    }
              }
            >
              <CurrentStatusCard card={statusCard} />
              {detailsAboveLine}
            </div>
            {onlyChoice ? (
              <span style={{ color: "var(--dg-color-text-primary)" }}>{onlyChoice.outcome}</span>
            ) : !showList ? null : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={LABEL_STYLE}>Change to</span>
                <RadioCardList
                  label="Change to"
                  options={choices.map((option) => ({
                    value: option.action,
                    label: option.label,
                    detail: option.detail,
                    icon: (
                      <StatusIconCircle
                        icon={STATUS_KIND_ICONS[option.kind]}
                        tone={CHOICE_TONES[option.kind]}
                        size={30}
                      />
                    ),
                  }))}
                  value={choice}
                  onChange={(next) => {
                    setChoice(next);
                    setCancellingPlan(false);
                  }}
                />
              </div>
            )}
            {notePlaceholder ? (
              <input
                className="dg-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={notePlaceholder}
                aria-label="Reason (optional)"
                style={{ fontSize: "var(--dg-fs-label)", width: "100%" }}
              />
            ) : null}
            {choice === "markAway" ? (
              <>
                <StartDateField value={startDate} onChange={setStartDate} />
                {datedFields}
              </>
            ) : null}
            {copy?.message ? <span>{copy.message}</span> : null}
            {copy && copy.points.length > 0 ? (
              <ConfirmSummaryBox summary={{ title: "Changes", points: copy.points }} />
            ) : null}
            {copy && copy.unchanged.length > 0 ? (
              <ConfirmSummaryBox summary={{ title: "Stays the same", points: copy.unchanged }} />
            ) : null}
          </div>
        }
        confirmLabel={
          choice || cancellingPlan || startsNow
            ? (copy?.label ?? "")
            : (isAway && onSetReturnDate) || (hasPlan && onSetPlannedAway && focus !== "status")
              ? "Save changes"
              : "Change status"
        }
        confirmDisabled={
          !choice && !awayDetailsChanged && !planChanged && !cancellingPlan && !startsNow
        }
        variant={choice === "archive" ? "danger" : ordinary ? "info" : "warning"}
        onConfirm={confirm}
        onCancel={close}
      />
    ) : null;

  if (startOpen) return dialog;

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={
          variant === "page"
            ? "dg-btn dg-btn-secondary"
            : variant === "card"
              ? "dg-btn dg-btn-secondary dg-btn-sm"
              : variant === "card-quiet"
                ? "dg-btn dg-btn-ghost dg-btn-sm"
                : "dg-btn dg-btn-ghost dg-btn-xs"
        }
        style={fillWidth ? { width: "100%", minWidth: 0 } : undefined}
      >
        {label}
      </Button>
      {dialog}
    </>
  );
}

/**
 * The status card's buttons: the change most people want next (Reinstate,
 * Mark active, Restore) as a button, and a menu naming each other change
 * (Mark away, Archive, and for someone Away, Change return date). Every one
 * opens a confirmation for that change alone. Active people get Change status.
 */
export function StatusCardActions(
  props: Omit<
    EmployeeStatusActionsProps,
    "variant" | "label" | "initialChoice" | "excludeChoice" | "focus" | "startOpen" | "onClosed"
  >,
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [opening, setOpening] = useState<MenuOpening | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Only changes this surface can make: one without a Reinstate handler offers no Reinstate.
  const offered = (action: StatusAction) =>
    (action !== "reinstate" || Boolean(props.onReinstate)) &&
    (action !== "suspend" || Boolean(props.onSuspend));
  const likely = suggestedStatusChoice(props.employee);
  const suggested = likely && offered(likely.action) ? likely : null;
  if (!suggested) return <EmployeeStatusActions {...props} variant="card" focus="status" />;
  const rest = statusChoices(props.employee).filter(
    (option) => option.action !== suggested.action && offered(option.action),
  );
  const away = props.employee.status === "inactive" && !props.employee.archivedAt;
  const items: { key: string; label: string; open: MenuOpening }[] = [
    ...(away && props.onSetReturnDate
      ? [
          {
            key: "details",
            label: describeStatusAction("setReturnDate", "", {
              currentReturnDate: props.employee.awayUntil ?? null,
              returnDate: props.employee.awayUntil ?? null,
            }).label,
            open: { details: true },
          },
        ]
      : []),
    ...rest.map((option) => ({
      key: option.action,
      label: describeStatusAction(option.action, "").label,
      open: { choice: option.action },
    })),
  ];
  return (
    <div className="flex items-center justify-end gap-1">
      <EmployeeStatusActions
        {...props}
        variant="card"
        label={describeStatusAction(suggested.action, "").label}
        initialChoice={suggested.action}
      />
      {items.length > 0 ? (
        <>
          <Button
            ref={triggerRef}
            aria-label="More status changes"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Ellipsis aria-hidden="true" size={16} />
          </Button>
          {menuOpen ? (
            <Menu
              open
              onOpenChange={(next) => {
                if (!next) setMenuOpen(false);
              }}
            >
              <MenuContent
                anchor={triggerRef}
                side="bottom"
                align="end"
                sideOffset={6}
                positionMethod="fixed"
                collisionPadding={8}
                finalFocus={triggerRef}
                style={{ minWidth: 180 }}
              >
                {items.map((item) => (
                  <MenuItem
                    key={item.key}
                    onClick={() => {
                      setMenuOpen(false);
                      setOpening(item.open);
                    }}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </>
      ) : null}
      {opening ? (
        // Mounted outside the menu, which unmounts as soon as an item is picked.
        <EmployeeStatusActions
          {...props}
          variant="card"
          startOpen
          initialChoice={opening.choice}
          focus={opening.details ? "plan" : undefined}
          onClosed={() => setOpening(null)}
        />
      ) : null}
    </div>
  );
}

/** What a card menu item opens: one change, or an Away person's return date. */
interface MenuOpening {
  choice?: StatusAction;
  details?: boolean;
}
