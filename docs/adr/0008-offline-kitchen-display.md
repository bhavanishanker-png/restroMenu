# 0008 — Offline-tolerant kitchen display

**Status:** Accepted

## Context

Restaurant wifi drops, especially in a kitchen full of metal. If a cook taps "Mark Ready" and nothing happens, they tap again, give up, or stop trusting the screen. A kitchen screen that doesn't survive a wifi drop gets unplugged within days.

## Options considered

1. **Block the UI while offline.** Honest, but the kitchen stops being able to work.
2. **Full offline sync** (local database such as IndexedDB, background sync, conflict resolution). Robust, but heavy for a single screen whose only writes are status changes.
3. **Optimistic updates plus a small persisted queue of pending status changes.**

## Decision

Option 3.

- **Optimistic.** A tap moves the card immediately. Online, the `PATCH` is sent; on failure the card rolls back and a toast explains it.
- **Queued when offline.** If the browser is offline, or the request fails at the network level, the change `{orderId, newStatus, prevStatus}` goes into a queue persisted to `localStorage`, so it survives a reload or a tablet restart.
- **Visible.** A banner shows "Offline — N changes pending".
- **Sync on reconnect.** On the `online` event the queue is replayed in order. Changes that succeed are removed. Changes the server rejects with **409** (invalid transition or someone else changed it) or **404** are dropped: the server wins.
- **Merge, don't flicker.** While changes are pending, incoming board data is overlaid with the queued statuses, so the board doesn't jump back to the old state between polls.

## Consequences

- ✅ Cooks keep working through short outages; nothing is lost on reload.
- ✅ Conflicts resolve safely because the server enforces the state machine and compare-and-set ([0004](0004-order-state-machine.md)). A stale offline change can never overwrite a newer one.
- ⚠️ "Server wins" means a cook's offline change can be discarded. The board shows the true status after the next poll, but there is no explicit "your change was rejected" message per order yet.
- ⚠️ A queue in one tablet's `localStorage` is per device. Two offline tablets don't see each other's pending changes; the server resolves them when both reconnect.
- ⚠️ `navigator.onLine` only knows about the local network, not whether the server is reachable. Network-level fetch failures are queued too, which covers most of the gap.

## Where it lives

- `src/components/kitchen/KitchenDisplay.tsx` — `loadQueue`, `saveQueue`, `flush`, `mergeOrders`, `handleAdvance`
