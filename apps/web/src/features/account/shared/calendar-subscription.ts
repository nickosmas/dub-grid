export interface CalendarSubscriptionStatus {
  active: boolean;
  issuedAt: string | null;
}

export interface CalendarSubscriptionIssued extends CalendarSubscriptionStatus {
  active: true;
  feedUrl: string;
}
