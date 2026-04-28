export interface NotificationPreferenceChannels {
  in_app: boolean;
  email: boolean;
}

export type NotificationPreferenceMap = Record<
  string,
  NotificationPreferenceChannels
>;
