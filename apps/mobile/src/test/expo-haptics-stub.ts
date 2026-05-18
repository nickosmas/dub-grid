export const selectionAsync = () => Promise.resolve();
export const impactAsync = (_style?: number) => Promise.resolve();
export const notificationAsync = (_type?: number) => Promise.resolve();
export const ImpactFeedbackStyle = {
  Light: 0,
  Medium: 1,
  Heavy: 2,
} as const;
export const NotificationFeedbackType = {
  Success: 0,
  Warning: 1,
  Error: 2,
} as const;
