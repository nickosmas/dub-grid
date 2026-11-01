export type ToastSurfaceTone = "error" | "success" | "info" | "warning";

export type ToastSurfaceProps = {
  testID: string;
  tone: ToastSurfaceTone;
  title?: string;
  message: string;
  /** The offline notice, which takes its own symbol on iOS. */
  isOfflineNotice?: boolean;
  onDismiss: () => void;
};
