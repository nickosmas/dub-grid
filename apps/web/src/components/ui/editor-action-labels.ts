/**
 * Both apps share this rule, so it lives in `@dubgrid/design-tokens`. This
 * module stays as the web import path only so the call sites here don't all
 * have to change; add nothing to it.
 */
export { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@dubgrid/design-tokens";
