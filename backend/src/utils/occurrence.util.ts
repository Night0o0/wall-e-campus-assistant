import { DayOfWeek } from "@prisma/client";

/**
 * A LectureSchedule is a recurring weekly slot: "SUNDAY, 12:00-14:00". It has
 * no date and no time zone, because a timetable does not have one — the times
 * are wall-clock times on the campus clock.
 *
 * A reminder, on the other hand, needs an instant. This module is the whole of
 * the conversion, and it is deliberately the only place that knows a lecture's
 * "12:00" is a local time: everything downstream works in real Dates.
 *
 * No LectureOccurrence table is introduced. The occurrence instant computed
 * here is stored on the Notification row it produces, which is all the identity
 * a reminder needs — see Notification.occurrenceStartsAt.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** JS getUTCDay() order: 0 = Sunday. */
const DAY_INDEX: Record<DayOfWeek, number> = {
  [DayOfWeek.SUNDAY]: 0,
  [DayOfWeek.MONDAY]: 1,
  [DayOfWeek.TUESDAY]: 2,
  [DayOfWeek.WEDNESDAY]: 3,
  [DayOfWeek.THURSDAY]: 4,
  [DayOfWeek.FRIDAY]: 5,
  [DayOfWeek.SATURDAY]: 6,
};

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  let formatter = formatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    formatterCache.set(timeZone, formatter);
  }

  return formatter;
};

/** The calendar reading a clock in `timeZone` shows at instant `date`. */
export const partsInZone = (date: Date, timeZone: string): ZonedParts => {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
};

/** The zone's offset from UTC at a given instant, in milliseconds. */
const offsetAt = (date: Date, timeZone: string) => {
  const parts = partsInZone(date, timeZone);

  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asIfUtc - date.getTime();
};

/**
 * The instant at which the clock in `timeZone` reads the given local date and
 * time.
 *
 * Resolved by successive approximation, because the offset that applies is the
 * offset *at the answer*, which is not known until the answer is: guess with
 * the offset in force at the naive instant, then re-read the offset there. Two
 * passes settle every real zone, including the hour either side of a daylight
 * saving change.
 */
export const zonedTimeToUtc = (
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
): Date => {
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute
  );

  let instant = naive - offsetAt(new Date(naive), timeZone);
  instant = naive - offsetAt(new Date(instant), timeZone);

  return new Date(instant);
};

/** "HH:MM" → { hour, minute }. The format is guaranteed by the schedule validator. */
const parseClock = (value: string) => {
  const [hour = "0", minute = "0"] = value.split(":");
  return { hour: Number(hour), minute: Number(minute) };
};

export interface RecurringSlot {
  dayOfWeek: DayOfWeek;
  /** Wall-clock "HH:MM" in the campus time zone. */
  startTime: string;
}

/**
 * Every start instant this weekly slot produces in the window `(from, from +
 * horizonMs]`. Exclusive at the near end so an occurrence starting exactly now
 * is behind us, inclusive at the far end.
 */
export const occurrencesBetween = (
  slot: RecurringSlot,
  from: Date,
  horizonMs: number,
  timeZone: string
): Date[] => {
  if (horizonMs <= 0) {
    return [];
  }

  const until = from.getTime() + horizonMs;
  const wanted = DAY_INDEX[slot.dayOfWeek];
  const clock = parseClock(slot.startTime);

  // Walk local calendar days from the day `from` falls on. One extra day at
  // each end covers the case where the local day differs from the UTC day.
  const startParts = partsInZone(from, timeZone);
  const firstDay = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const days = Math.ceil(horizonMs / DAY_MS) + 2;

  const occurrences: Date[] = [];

  for (let offset = 0; offset <= days; offset += 1) {
    // Date arithmetic on a UTC midnight, so adding days never drifts an hour.
    const cursor = new Date(firstDay + offset * DAY_MS);

    if (cursor.getUTCDay() !== wanted) {
      continue;
    }

    const occurrence = zonedTimeToUtc(
      {
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
        day: cursor.getUTCDate(),
        ...clock,
      },
      timeZone
    );

    const time = occurrence.getTime();

    if (time > from.getTime() && time <= until) {
      occurrences.push(occurrence);
    }
  }

  return occurrences;
};

/** The first occurrence of this slot strictly after `from`. */
export const nextOccurrence = (
  slot: RecurringSlot,
  from: Date,
  timeZone: string
): Date | null => occurrencesBetween(slot, from, 8 * DAY_MS, timeZone)[0] ?? null;

/** "12:00" in the campus zone rendered for a human: "12:00 PM". */
export const formatClock = (date: Date, timeZone: string) => {
  const { hour, minute } = partsInZone(date, timeZone);
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
};

/** "Sunday" — the weekday the instant falls on, on the campus clock. */
export const formatWeekday = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);

/** Whole local days between two instants, by calendar date rather than by hours. */
export const calendarDaysBetween = (
  from: Date,
  to: Date,
  timeZone: string
) => {
  const a = partsInZone(from, timeZone);
  const b = partsInZone(to, timeZone);

  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      DAY_MS
  );
};
