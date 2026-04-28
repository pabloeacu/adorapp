// Realtime sync for the four core tables: members, bands, songs, orders.
//
// Why this exists: without it, a change made by another user (a pastor adds
// a song, a leader edits an order, etc.) only shows up the next time the
// current client navigates or returns from background. With this in place,
// changes propagate in ~1s while the app is open, including when the PWA is
// in the foreground but the user is on a different page.
//
// Strategy:
//   * One channel per session, listens to INSERT/UPDATE/DELETE on each table.
//   * On any event, dispatch into appStore.mergeRealtimeChange — patches the
//     store array in place so React rerenders without a full refetch.
//   * On visibilitychange→visible: ask the channel for status; if it's not
//     'SUBSCRIBED' anymore (mobile suspends sockets aggressively), tear it
//     down and reopen. Belt-and-suspenders alongside the SDK's auto-reconnect.

import { supabase } from './supabase';
import { useAppStore } from '../stores/appStore';

let channel = null;
let visibilityHandler = null;
let lastStatus = null;

const TABLES = ['members', 'bands', 'songs', 'orders'];

function attach() {
  if (channel) return channel;

  const merge = useAppStore.getState().mergeRealtimeChange;

  let c = supabase.channel('app-data-sync');
  for (const table of TABLES) {
    c = c.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        merge({
          table: payload.table,
          eventType: payload.eventType,
          newRow: payload.new,
          oldRow: payload.old,
        });
      }
    );
  }
  c.subscribe((status) => {
    lastStatus = status;
  });
  channel = c;
  return channel;
}

function detach() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    lastStatus = null;
  }
}

/**
 * Start the realtime sync. Idempotent — safe to call multiple times.
 * Returns a stop() function for cleanup on logout / unmount.
 */
export function startRealtimeSync() {
  attach();

  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      // If the channel reports it's not subscribed (mobile suspended the WS),
      // recreate it. The SDK usually handles this but mobile Safari has been
      // observed to silently leave channels in a CHANNEL_ERROR or CLOSED state.
      if (lastStatus && lastStatus !== 'SUBSCRIBED') {
        detach();
        attach();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  return stopRealtimeSync;
}

export function stopRealtimeSync() {
  detach();
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
