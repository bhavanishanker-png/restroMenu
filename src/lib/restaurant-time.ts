import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * "Today" means the restaurant's today, not the server's.
 *
 * Every daily figure used to start from `new Date().setHours(0,0,0,0)` — the
 * server's local midnight. On a UTC host that is 05:30 IST, so orders placed
 * between midnight and 05:30 counted towards the previous day, the kitchen
 * board dropped them, and the hourly chart was shifted by 5½ hours.
 *
 * All of these take the IANA zone stored on `restaurants.timezone`; load it
 * with getRestaurantTimezone (lib/queries/restaurant-timezone.ts). Pure date
 * helpers only, so client components may import this file too.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** Calendar date in the zone, as YYYY-MM-DD. */
export function dayKeyInZone(instant: Date | string, timezone: string): string {
  return formatInTimeZone(new Date(instant), timezone, "yyyy-MM-dd");
}

/** Hour of day (0–23) in the zone. */
export function hourInZone(instant: Date | string, timezone: string): number {
  return Number(formatInTimeZone(new Date(instant), timezone, "H"));
}

/**
 * The instant the restaurant's day began, `daysAgo` days before today.
 * Returned as a real instant (a Date), ready for `.gte("placed_at", …)`.
 */
export function startOfRestaurantDay(timezone: string, now: Date = new Date(), daysAgo = 0): Date {
  // Calendar arithmetic on the zoned date string, then back to an instant:
  // correct across DST changes in zones that have them.
  const today = dayKeyInZone(now, timezone);
  const day = daysAgo === 0 ? today : formatDay(addDays(new Date(`${today}T12:00:00Z`), -daysAgo));
  return fromZonedTime(`${day}T00:00:00`, timezone);
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
