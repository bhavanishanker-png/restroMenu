import { describe, expect, it } from "vitest";
import { dayKeyInZone, hourInZone, startOfRestaurantDay } from "@/lib/restaurant-time";

const IST = "Asia/Kolkata";

describe("startOfRestaurantDay", () => {
  it("is IST midnight, i.e. 18:30 UTC the previous evening", () => {
    // 2026-10-02 10:00 IST
    const now = new Date("2026-10-02T04:30:00Z");
    expect(startOfRestaurantDay(IST, now).toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });

  it("uses the restaurant's date, not UTC's, just after IST midnight", () => {
    // 2026-10-03 00:15 IST — still 2 Oct in UTC.
    const now = new Date("2026-10-02T18:45:00Z");
    expect(startOfRestaurantDay(IST, now).toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });

  it("goes back whole calendar days", () => {
    const now = new Date("2026-10-02T04:30:00Z");
    expect(startOfRestaurantDay(IST, now, 29).toISOString()).toBe("2026-09-02T18:30:00.000Z");
  });

  it("follows DST in zones that have it", () => {
    // London is on BST (UTC+1) in early October.
    const now = new Date("2026-10-02T12:00:00Z");
    expect(startOfRestaurantDay("Europe/London", now).toISOString()).toBe("2026-10-01T23:00:00.000Z");
  });
});

describe("dayKeyInZone / hourInZone", () => {
  it("puts a 23:30 IST order on its IST day, not the UTC one", () => {
    const placed = "2026-10-02T18:00:00Z"; // 23:30 IST, 2 Oct
    expect(dayKeyInZone(placed, IST)).toBe("2026-10-02");
    expect(hourInZone(placed, IST)).toBe(23);
  });

  it("puts a 01:00 IST order on the next day", () => {
    const placed = "2026-10-02T19:30:00Z"; // 01:00 IST, 3 Oct — 2 Oct in UTC
    expect(dayKeyInZone(placed, IST)).toBe("2026-10-03");
    expect(hourInZone(placed, IST)).toBe(1);
  });
});
