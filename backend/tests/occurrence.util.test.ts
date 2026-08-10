import { DayOfWeek } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  formatClock,
  nextOccurrence,
  occurrencesBetween,
} from "../src/utils/occurrence.util.js";

/**
 * A lecture's "12:00" is a reading on the campus clock, not an instant. These
 * tests pin the conversion, including the part that only shows up twice a year:
 * Egypt runs UTC+3 in summer and UTC+2 in winter, so the same timetable row
 * fires an hour apart in August and January.
 */

const CAIRO = "Africa/Cairo";
const DAY = 24 * 60 * 60 * 1000;

const electronics = {
  dayOfWeek: DayOfWeek.SUNDAY,
  startTime: "12:00",
};

describe("weekly occurrences", () => {
  it("resolves a wall-clock lecture against the campus time zone in summer", () => {
    // Wednesday 5 August 2026. Cairo is on UTC+3.
    const occurrence = nextOccurrence(
      electronics,
      new Date("2026-08-05T10:00:00.000Z"),
      CAIRO
    );

    expect(occurrence?.toISOString()).toBe("2026-08-09T09:00:00.000Z");
  });

  it("resolves the same lecture an hour later in winter", () => {
    // Wednesday 7 January 2026. Cairo is on UTC+2.
    const occurrence = nextOccurrence(
      electronics,
      new Date("2026-01-07T10:00:00.000Z"),
      CAIRO
    );

    expect(occurrence?.toISOString()).toBe("2026-01-11T10:00:00.000Z");
  });

  it("returns every occurrence inside the horizon, in order", () => {
    const occurrences = occurrencesBetween(
      electronics,
      new Date("2026-08-05T10:00:00.000Z"),
      21 * DAY,
      CAIRO
    );

    expect(occurrences.map((date) => date.toISOString())).toEqual([
      "2026-08-09T09:00:00.000Z",
      "2026-08-16T09:00:00.000Z",
      "2026-08-23T09:00:00.000Z",
    ]);
  });

  it("treats a lecture starting exactly now as behind us", () => {
    const startsNow = new Date("2026-08-09T09:00:00.000Z");

    expect(occurrencesBetween(electronics, startsNow, 6 * DAY, CAIRO)).toEqual(
      []
    );

    // A second earlier, it is still ahead.
    expect(
      occurrencesBetween(
        electronics,
        new Date("2026-08-09T08:59:59.000Z"),
        6 * DAY,
        CAIRO
      )
    ).toHaveLength(1);
  });

  it("finds the same day's later lecture before next week's", () => {
    const evening = { dayOfWeek: DayOfWeek.SUNDAY, startTime: "18:00" };

    const occurrence = nextOccurrence(
      evening,
      new Date("2026-08-09T09:00:00.000Z"),
      CAIRO
    );

    expect(occurrence?.toISOString()).toBe("2026-08-09T15:00:00.000Z");
  });

  it("crosses the daylight saving change without dropping or doubling a week", () => {
    // Egypt ends DST in late October 2026; the Sundays either side of it must
    // both land on 12:00 local, at different UTC instants.
    const occurrences = occurrencesBetween(
      electronics,
      new Date("2026-10-18T00:00:00.000Z"),
      21 * DAY,
      CAIRO
    );

    expect(occurrences).toHaveLength(3);
    expect(
      occurrences.every((date) => formatClock(date, CAIRO) === "12:00 PM")
    ).toBe(true);
  });

  it("renders the campus clock for a human", () => {
    expect(formatClock(new Date("2026-08-09T09:00:00.000Z"), CAIRO)).toBe(
      "12:00 PM"
    );
    expect(formatClock(new Date("2026-08-09T05:30:00.000Z"), CAIRO)).toBe(
      "8:30 AM"
    );
    expect(formatClock(new Date("2026-08-09T21:00:00.000Z"), CAIRO)).toBe(
      "12:00 AM"
    );
  });
});
