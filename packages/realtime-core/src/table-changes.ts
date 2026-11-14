import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * What the database broadcasts when a statement changes a table (migration
 * 140): the table and operation, never row data. Every listener uses it to
 * refetch.
 */
export interface RealtimeChangePayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE";
  /** Which topic carried it; a draft change arrives on the drafts topic. */
  scope?: "org" | "drafts" | "user" | "platform";
  /** Set when a membership update only stamped who opened Schedule. */
  viewStamps?: ReadonlyArray<{ userId: string; updatedAt: string }>;
  /** On the platform topic: the organizations the statement touched. */
  orgIds?: readonly string[];
  /** On the platform topic: the people the statement touched. */
  userIds?: readonly string[];
}

/** Everyone in the organization. */
export const orgTopic = (orgId: string) => `org:${orgId}`;
/** People who edit the organization's schedule: draft cells, snapshots and notes. */
export const orgDraftsTopic = (orgId: string) => `org:${orgId}:drafts`;
/** One person's own rows: alerts, profile, sessions, membership, staff record. */
export const userTopic = (userId: string) => `user:${userId}`;
/** Gridmasters, for every change. */
export const PLATFORM_TOPIC = "platform";

export interface TableChangeListener<Table extends string = string> {
  table: Table;
  topic: string;
  /** Defaults to every operation. */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  onEvent: (table: Table, payload: RealtimeChangePayload) => void;
}

export interface RealtimeErrorHooks {
  /**
   * Called on CHANNEL_ERROR. `consecutiveErrorCount` is 1 on the first error
   * since the last successful SUBSCRIBE and grows on each further one, so a
   * caller can choose when to escalate; the Supabase client retries itself.
   */
  onError?: (error: Error, consecutiveErrorCount: number) => void;
  /**
   * Called once when a topic re-SUBSCRIBEs after a CHANNEL_ERROR or a
   * TIMED_OUT: the "events may have been missed" catch-up signal.
   */
  onReconnectAfterError?: () => void;
}

type WireChange = {
  table?: unknown;
  op?: unknown;
  scope?: unknown;
  view_stamps?: unknown;
  org_ids?: unknown;
  user_ids?: unknown;
};

type MessageHandler = (change: WireChange) => void;
type StatusHandler = (status: string, error?: Error) => void;

type TopicEntry = {
  channel: RealtimeChannel;
  messageHandlers: Set<MessageHandler>;
  statusHandlers: Set<StatusHandler>;
  teardown: ReturnType<typeof setTimeout> | null;
};

/**
 * A Broadcast topic is the channel's name, so two hooks on one topic must
 * share its channel: each gets its handlers on it, and the last to leave
 * removes it. Leaving waits a moment so a remount (React StrictMode, a fast
 * route change) takes the channel back instead of racing its removal.
 */
const TEARDOWN_DELAY_MS = 1_000;
const topicsByClient = new WeakMap<SupabaseClient, Map<string, TopicEntry>>();

function acquireTopic(
  client: SupabaseClient,
  topic: string,
  onMessage: MessageHandler,
  onStatus: StatusHandler,
): () => void {
  let topics = topicsByClient.get(client);
  if (!topics) {
    topics = new Map();
    topicsByClient.set(client, topics);
  }
  let entry = topics.get(topic);
  // Sign-out removes every channel on the client directly; a closed one is
  // replaced rather than listened on.
  if (entry && entry.channel.state === "closed") {
    if (entry.teardown) clearTimeout(entry.teardown);
    topics.delete(topic);
    entry = undefined;
  }
  if (entry?.teardown) {
    clearTimeout(entry.teardown);
    entry.teardown = null;
  }
  if (!entry) {
    const created: TopicEntry = {
      channel: client.channel(topic, { config: { private: true } }),
      messageHandlers: new Set(),
      statusHandlers: new Set(),
      teardown: null,
    };
    created.channel.on("broadcast", { event: "change" }, (message: { payload?: WireChange }) => {
      for (const handler of [...created.messageHandlers]) handler(message.payload ?? {});
    });
    created.channel.subscribe((status: string, error?: Error) => {
      for (const handler of [...created.statusHandlers]) handler(status, error);
    });
    topics.set(topic, created);
    entry = created;
  }
  const held = entry;
  held.messageHandlers.add(onMessage);
  held.statusHandlers.add(onStatus);

  return () => {
    held.messageHandlers.delete(onMessage);
    held.statusHandlers.delete(onStatus);
    if (held.messageHandlers.size > 0 || held.teardown) return;
    held.teardown = setTimeout(() => {
      held.teardown = null;
      if (held.messageHandlers.size > 0) return;
      if (topics?.get(topic) === held) topics.delete(topic);
      void client.removeChannel(held.channel);
    }, TEARDOWN_DELAY_MS);
  };
}

const OPERATIONS = new Set(["INSERT", "UPDATE", "DELETE"]);
const SCOPES = new Set(["org", "drafts", "user", "platform"]);

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : undefined;
}

export function toChangePayload(change: WireChange): RealtimeChangePayload {
  const payload: RealtimeChangePayload = {};
  if (typeof change.op === "string" && OPERATIONS.has(change.op)) {
    payload.eventType = change.op as RealtimeChangePayload["eventType"];
  }
  if (typeof change.scope === "string" && SCOPES.has(change.scope)) {
    payload.scope = change.scope as RealtimeChangePayload["scope"];
  }
  if (Array.isArray(change.view_stamps)) {
    payload.viewStamps = change.view_stamps.flatMap((stamp: unknown) => {
      const { user_id: userId, updated_at: updatedAt } = (stamp ?? {}) as Record<string, unknown>;
      return typeof userId === "string" && typeof updatedAt === "string"
        ? [{ userId, updatedAt }]
        : [];
    });
  }
  const orgIds = strings(change.org_ids);
  if (orgIds) payload.orgIds = orgIds;
  const userIds = strings(change.user_ids);
  if (userIds) payload.userIds = userIds;
  return payload;
}

/**
 * Listens for table changes on private Broadcast topics, each listener on the
 * topic it names. Wraps CHANNEL_ERROR and reconnect bookkeeping for the
 * subscription as a whole. Returns a cleanup function.
 */
export function subscribeToTableChanges<Table extends string>(
  client: SupabaseClient,
  listeners: ReadonlyArray<TableChangeListener<Table>>,
  hooks: RealtimeErrorHooks = {},
): () => void {
  let errorCount = 0;
  // A TIMED_OUT join is a gap in the stream like an error, but arrives with
  // no error object, so it is tracked apart from the count onError sees.
  let interrupted = false;

  const onStatus: StatusHandler = (status, error) => {
    // A throwing hook must not reach the Supabase client's own status
    // dispatch, which every listener on the socket shares.
    if (status === "SUBSCRIBED" && interrupted) {
      errorCount = 0;
      interrupted = false;
      try {
        hooks.onReconnectAfterError?.();
      } catch (hookError) {
        console.error("[realtime-core] onReconnectAfterError hook threw", hookError);
      }
    } else if (status === "TIMED_OUT") {
      interrupted = true;
    } else if (status === "CHANNEL_ERROR") {
      errorCount += 1;
      interrupted = true;
      try {
        hooks.onError?.(error ?? new Error("realtime channel error"), errorCount);
      } catch (hookError) {
        console.error("[realtime-core] onError hook threw", hookError);
      }
    }
  };

  const byTopic = new Map<string, TableChangeListener<Table>[]>();
  for (const listener of listeners) {
    byTopic.set(listener.topic, [...(byTopic.get(listener.topic) ?? []), listener]);
  }

  const releases = [...byTopic].map(([topic, topicListeners]) =>
    acquireTopic(
      client,
      topic,
      (change) => {
        const payload = toChangePayload(change);
        for (const listener of topicListeners) {
          if (listener.table !== change.table) continue;
          const event = listener.event ?? "*";
          if (event !== "*" && event !== payload.eventType) continue;
          listener.onEvent(listener.table, payload);
        }
      },
      onStatus,
    ),
  );

  return () => {
    for (const release of releases) release();
  };
}
