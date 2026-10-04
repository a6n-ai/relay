"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api-fetch";

export interface FeedItem {
  publicId: string;
  /** Null for a campaign notification, which has no business event. */
  event: string | null;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface RealtimeNotification {
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
}

export interface UseNotificationsOptions {
  /**
   * Realtime transport. Returns an unsubscribe function.
   *
   * The callback takes an OPTIONAL notification: a transport that carries the
   * payload (tiffin-grab's AppSync) passes it and the hook prepends it, while a
   * ping-only transport (@foundry/realtime's `{ type: "message" }` frame carries
   * no payload) calls it with nothing and the hook refetches the feed.
   */
  subscribe?: (onEvent: (n?: RealtimeNotification) => void) => Promise<() => void>;
  /** Feed endpoint. Defaults to the convention both apps use. */
  endpoint?: string;
  /**
   * Feed rendered on the server. When given, the bell paints with its badge at
   * once and skips the fetch on mount.
   */
  initial?: FeedResponse;
}

export interface FeedResponse {
  items: FeedItem[];
  unread: number;
}

// Live push keeps the feed current; the focus refetch only covers a dropped
// stream, so it runs once the feed is this old, not on every tab switch.
const FOCUS_STALE_MS = 60_000;

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { subscribe, endpoint = "/api/notifications", initial } = options;
  const [items, setItems] = useState<FeedItem[]>(initial?.items ?? []);
  const [unread, setUnread] = useState(initial?.unread ?? 0);
  // 0 = never loaded. Set when a fetch starts, so mount + the focus event that
  // fires on page load don't both fetch.
  const loadedAt = useRef(initial ? Date.now() : 0);

  const refresh = useCallback(async () => {
    loadedAt.current = Date.now();
    const res = await fetch(endpoint);
    if (!res.ok) return;
    const data = (await res.json()) as FeedResponse;
    setItems(data.items);
    setUnread(data.unread);
  }, [endpoint]);

  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() })));
    // ponytail: user action → surface failures via toast (apiFetch). The focus
    // poll in `refresh` stays silent on purpose so it can't spam toasts.
    await apiFetch(endpoint, { method: "POST", body: JSON.stringify({}) });
  }, [unread, endpoint]);

  // Initial load (unless server-rendered) + refresh when the tab regains focus
  // after the feed went stale.
  useEffect(() => {
    // Fetch-on-mount: every setState in `refresh` runs after an await, but the rule
    // cannot see through the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loadedAt.current === 0) void refresh();
    const onFocus = () => {
      if (Date.now() - loadedAt.current >= FOCUS_STALE_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Live push. With no transport injected there is nothing to subscribe to and
  // the bell falls back to the initial load plus the focus refetch above.
  useEffect(() => {
    if (!subscribe) return;
    let unsub = () => {};
    let active = true;
    // A payload-carrying transport hands us the row; a ping-only one calls with
    // nothing and we refetch, because the frame has no body to prepend.
    const onEvent = (n?: RealtimeNotification) => {
      if (!n) {
        void refresh();
        return;
      }
      setItems((prev) =>
        prev.some((p) => p.publicId === n.publicId)
          ? prev
          : [{ ...n, readAt: null, createdAt: Date.now() }, ...prev],
      );
      setUnread((u) => u + 1);
    };
    void subscribe(onEvent).then((fn) => {
      if (active) unsub = fn;
      else fn();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [subscribe, refresh]);

  return { items, unread, markAllRead, refresh };
}
