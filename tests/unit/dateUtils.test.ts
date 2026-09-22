import { describe, it, expect } from "vitest";
import { calculateLeaveDays } from "../../src/utils/dateUtils.ts";

// Built with the local-time Date(year, monthIndex, day) constructor rather
// than date-only ISO strings, so the day-of-week math doesn't depend on the
// timezone the test runner happens to be in (ISO date-only strings parse as
// UTC midnight, which can shift to the previous local day west of UTC).
describe("calculateLeaveDays", () => {
  it("counts a single weekday as 1 day", () => {
    const monday = new Date(2026, 8, 21); // Monday
    expect(calculateLeaveDays(monday, monday)).toBe(1);
  });

  it("counts a single Saturday as 0 days", () => {
    const saturday = new Date(2026, 8, 19);
    expect(calculateLeaveDays(saturday, saturday)).toBe(0);
  });

  it("counts a single Sunday as 0 days", () => {
    const sunday = new Date(2026, 8, 20);
    expect(calculateLeaveDays(sunday, sunday)).toBe(0);
  });

  it("counts Monday through Friday as 5 days", () => {
    const monday = new Date(2026, 8, 21);
    const friday = new Date(2026, 8, 25);
    expect(calculateLeaveDays(monday, friday)).toBe(5);
  });

  it("counts Friday through Monday as 2 days (one weekend skipped)", () => {
    const friday = new Date(2026, 8, 18);
    const monday = new Date(2026, 8, 21);
    expect(calculateLeaveDays(friday, monday)).toBe(2);
  });

  it("counts Monday through Wednesday as 3 days", () => {
    const monday = new Date(2026, 8, 21);
    const wednesday = new Date(2026, 8, 23);
    expect(calculateLeaveDays(monday, wednesday)).toBe(3);
  });

  it("counts weekdays correctly across two weekends", () => {
    // Mon 2026-09-14 through Fri 2026-09-25 = 2 full work weeks = 10 days
    const start = new Date(2026, 8, 14);
    const end = new Date(2026, 8, 25);
    expect(calculateLeaveDays(start, end)).toBe(10);
  });

  it("returns 0 when startDate is after endDate", () => {
    const start = new Date(2026, 8, 25);
    const end = new Date(2026, 8, 21);
    expect(calculateLeaveDays(start, end)).toBe(0);
  });

  it("does not mutate the caller's startDate object", () => {
    const start = new Date(2026, 8, 21);
    const originalTime = start.getTime();
    const end = new Date(2026, 8, 25);

    calculateLeaveDays(start, end);

    expect(start.getTime()).toBe(originalTime);
  });
});
