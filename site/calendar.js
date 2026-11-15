import ICAL from "./vendor/ical.js";

/**
 * @typedef {'booked' | 'provisional'} DayStatus
 * @typedef {{ start: Date, end: Date, status: DayStatus, allDay: boolean }} BusyBlock
 */

/**
 * Parse an ICS string into busy blocks with a fixed status.
 * Titles are never stored — clients only see status.
 * @param {string} icsText
 * @param {DayStatus} status
 * @returns {BusyBlock[]}
 */
export function parseBusyBlocks(icsText, status = "booked") {
  if (!icsText) return [];

  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");
  /** @type {BusyBlock[]} */
  const blocks = [];

  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 1);
  const past = new Date();
  past.setMonth(past.getMonth() - 1);

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      let guard = 0;
      while ((next = iterator.next()) && guard < 400) {
        guard += 1;
        const start = next.toJSDate();
        if (start > horizon) break;
        if (start < past) continue;
        const duration = event.duration;
        const end = duration
          ? new Date(start.getTime() + duration.toSeconds() * 1000)
          : new Date(start);
        blocks.push({
          start,
          end,
          status,
          allDay: event.startDate?.isDate ?? false,
        });
      }
    } else {
      const start = event.startDate.toJSDate();
      const end = event.endDate
        ? event.endDate.toJSDate()
        : new Date(start.getTime() + 60 * 60 * 1000);
      if (end < past || start > horizon) continue;
      blocks.push({
        start,
        end,
        status,
        allDay: event.startDate?.isDate ?? false,
      });
    }
  }

  return blocks.sort((a, b) => a.start - b.start);
}

/**
 * Merge unavailable + provisional feeds.
 * Unavailable always wins on the same day.
 * @param {string | null | string[]} unavailableIcs one feed or several
 * @param {string | null} provisionalIcs
 * @returns {BusyBlock[]}
 */
export function mergeCalendarFeeds(unavailableIcs, provisionalIcs) {
  const feeds = Array.isArray(unavailableIcs)
    ? unavailableIcs
    : unavailableIcs
      ? [unavailableIcs]
      : [];
  const unavailable = feeds.flatMap((ics) =>
    parseBusyBlocks(ics || "", "booked"),
  );
  const provisional = parseBusyBlocks(provisionalIcs || "", "provisional");
  return [...unavailable, ...provisional].sort((a, b) => a.start - b.start);
}

/**
 * Demo blocks so the page works before ICS URLs are configured.
 * @returns {BusyBlock[]}
 */
export function demoBusyBlocks() {
  const today = startOfDay(new Date());

  const addDays = (base, n) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };

  /** @type {BusyBlock[]} */
  const blocks = [];

  const samples = [
    { offset: 2, days: 1, status: "booked" },
    { offset: 5, days: 2, status: "provisional" },
    { offset: 12, days: 1, status: "booked" },
    { offset: 18, days: 3, status: "provisional" },
    { offset: 28, days: 1, status: "booked" },
    { offset: 35, days: 2, status: "provisional" },
  ];

  for (const sample of samples) {
    const start = addDays(today, sample.offset);
    const end = addDays(start, sample.days);
    blocks.push({
      start,
      end,
      status: sample.status,
      allDay: true,
    });
  }

  return blocks;
}

/** @param {Date} date */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {Date} date */
export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Apple all-day events often end at midnight of the next day (exclusive).
 * @param {BusyBlock} block
 * @param {Date} day
 */
export function blockCoversDay(block, day) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  const blockStart = block.start.getTime();
  const blockEnd = block.allDay
    ? block.end.getTime() - 1
    : block.end.getTime();
  return blockStart <= dayEnd && blockEnd >= dayStart;
}

/**
 * @param {BusyBlock[]} blocks
 * @param {Date} day
 * @returns {BusyBlock[]}
 */
export function blocksOnDay(blocks, day) {
  return blocks.filter((b) => blockCoversDay(b, day));
}

/**
 * Resolve the display status for a day.
 * Booked takes precedence over provisional.
 * @param {BusyBlock[]} blocks
 * @param {Date} day
 * @returns {DayStatus | null}
 */
export function dayStatus(blocks, day) {
  const hits = blocksOnDay(blocks, day);
  if (hits.some((b) => b.status === "booked")) return "booked";
  if (hits.some((b) => b.status === "provisional")) return "provisional";
  return null;
}

/**
 * @param {Date} yearMonth first of month
 * @param {BusyBlock[]} blocks
 */
export function buildMonthCells(yearMonth, blocks) {
  const year = yearMonth.getFullYear();
  const month = yearMonth.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const startPad = (first.getDay() + 6) % 7;
  /** @type {{ date: Date, inMonth: boolean, status: DayStatus | null }[]} */
  const cells = [];

  for (let i = 0; i < startPad; i += 1) {
    const date = new Date(year, month, 1 - (startPad - i));
    cells.push({
      date,
      inMonth: false,
      status: dayStatus(blocks, date),
    });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      date,
      inMonth: true,
      status: dayStatus(blocks, date),
    });
  }

  while (cells.length % 7 !== 0) {
    const prev = cells[cells.length - 1].date;
    const date = new Date(prev);
    date.setDate(date.getDate() + 1);
    cells.push({
      date,
      inMonth: false,
      status: dayStatus(blocks, date),
    });
  }

  return cells;
}

/**
 * Upcoming available / provisional / booked stretches.
 * @param {BusyBlock[]} blocks
 * @param {number} daysAhead
 */
export function upcomingSummary(blocks, daysAhead = 60) {
  const today = startOfDay(new Date());
  /** @type {{ type: 'available' | 'booked' | 'provisional', start: Date, end: Date, label: string }[]} */
  const items = [];

  /** @type {'available' | 'booked' | 'provisional' | null} */
  let runType = null;
  /** @type {Date | null} */
  let runStart = null;

  const flush = (endDay) => {
    if (runType === null || runStart === null) return;
    items.push({
      type: runType,
      start: runStart,
      end: endDay,
      label: formatRange(runStart, endDay),
    });
    runType = null;
    runStart = null;
  };

  for (let i = 0; i < daysAhead; i += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const status = dayStatus(blocks, day);
    /** @type {'available' | 'booked' | 'provisional'} */
    const type = status || "available";

    if (runType === null) {
      runType = type;
      runStart = day;
      continue;
    }

    if (type === runType) continue;

    const end = new Date(day);
    end.setDate(end.getDate() - 1);
    flush(end);
    runType = type;
    runStart = day;
  }

  if (runType !== null && runStart !== null) {
    const end = new Date(today);
    end.setDate(today.getDate() + daysAhead - 1);
    flush(end);
  }

  return items.slice(0, 14);
}

/** @param {Date} start @param {Date} end */
export function formatRange(start, end) {
  const same =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const opts = { weekday: "short", day: "numeric", month: "short" };
  if (same) return start.toLocaleDateString("en-GB", opts);
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`;
}

/** @param {Date} date */
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
