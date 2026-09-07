import type { ReactNode } from "react";

interface StaffPanelFooterProps {
  actions?: ReactNode;
  editorActions?: ReactNode;
}

export function StaffPanelFooter({ actions, editorActions }: StaffPanelFooterProps) {
  return (
    <>
      {actions ? (
        <div className="staff-panel-action-footer" data-slot="staff-panel-actions">
          {actions}
        </div>
      ) : null}
      {editorActions ? (
        <div className="staff-panel-editor-footer" data-slot="staff-panel-editor-actions">
          {editorActions}
        </div>
      ) : null}
    </>
  );
}
