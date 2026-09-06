import { Children, Fragment, isValidElement, type ReactNode } from "react";

interface ActionItem {
  key: string;
  node: ReactNode;
}

/** Count visible actions through conditional children, arrays, and fragments. */
export function getActionItems(children: ReactNode, parentKey = ""): ActionItem[] {
  return Children.toArray(children).flatMap((node, index) => {
    const key = `${parentKey}/${isValidElement(node) ? node.key : index}`;
    if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment) {
      return getActionItems(node.props.children, key);
    }
    return [{ key, node }];
  });
}

/** Supporting actions keep their order; the main action always reads last. */
export function getOrderedActionItems(
  children: ReactNode,
  primaryAction?: ReactNode,
): ActionItem[] {
  return [...getActionItems(children, "secondary"), ...getActionItems(primaryAction, "primary")];
}
