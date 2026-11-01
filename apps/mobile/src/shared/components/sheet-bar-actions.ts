import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { ActionButtons } from "./ActionButtons";
import { SheetActions } from "./BottomSheetModalDrawn";
import { Button } from "./Button";

export type ButtonProps = ComponentProps<typeof Button>;

/** A footer button drawn in a sheet's top bar (`SheetBarAction`). */
export type BarActionProps = {
  action: ButtonProps;
  kind: "primary" | "secondary";
  /** The sheet's title, so a label that repeats it can shorten to its verb. */
  title?: string;
};

const CANCEL_LABELS = new Set(["Cancel", "Close", "Dismiss", "Not now", "Back", "Keep editing"]);

export type LiftedActions = {
  rest: ReactNode;
  primary?: ButtonProps;
  secondary?: ButtonProps;
  /** The footer's cancel (Cancel, Back), whose press the bar's leading control makes. */
  cancel?: ButtonProps;
  onCancel?: ButtonProps["onPress"];
};

/**
 * Takes a footer's `SheetActions` (a primary `Button` and an optional second
 * one) out of it, so the sheet can draw them in its top bar the way the
 * platform does (owner, 2026-10-31): a Cancel becomes the close button, the
 * primary the trailing action. Anything else in the footer, such as an error
 * line, stays at the bottom. A footer of any other shape is left alone.
 */
export function liftSheetActions(node: ReactNode): LiftedActions {
  const lifted: LiftedActions = { rest: node };

  const walk = (child: ReactNode): ReactNode => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ children?: ReactNode; primaryAction?: ReactNode }>;
    if (element.type === SheetActions || element.type === ActionButtons) {
      const primary = element.props.primaryAction;
      const others = Children.toArray(element.props.children);
      const second = others[0];
      const isButton = (value: unknown): value is ReactElement<ButtonProps> =>
        isValidElement(value) && value.type === Button;
      if (!isButton(primary) || others.length > 1 || (second && !isButton(second))) {
        return child;
      }
      lifted.primary = primary.props;
      if (second) {
        const props = (second as ReactElement<ButtonProps>).props;
        if (props.tone === "plain" || (props.label && CANCEL_LABELS.has(props.label))) {
          lifted.cancel = props;
          lifted.onCancel = props.onPress;
        } else if (!props.disabled) {
          // A second action with nothing to act on (Clear all with no filter
          // set) gives its place back to the close button.
          lifted.secondary = props;
        }
      }
      return null;
    }
    if (element.props.children === undefined) return child;
    const mapped = Children.map(element.props.children, walk) ?? [];
    if ((mapped as unknown[]).every((value) => value == null || value === false)) return null;
    return cloneElement(element, undefined, ...mapped);
  };

  lifted.rest = walk(node);
  return lifted;
}
