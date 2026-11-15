import {
  buildMonthCells,
  dayStatus,
  formatRange,
  mergeCalendarFeeds,
  startOfDay,
} from "../../../site/calendar.js";

const MONTHS = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Solid hex colours (Outlook-safe — avoid rgba). Matched to site washes. */
const COLORS = {
  ink: "#1c2421",
  inkSoft: "#4a5752",
  paper: "#f3f6f4",
  line: "#d5ddd8",
  white: "#ffffff",
  available: "#2f6b57",
  availableBg: "#e8f0ed",
  provisional: "#a8862a",
  provisionalBg: "#f4edd9",
  booked: "#9a4a3a",
  bookedBg: "#f2e9e6",
  mutedBg: "#eef1ef",
  mutedText: "#8a9691",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBeforeDay(a, b) {
  const aa = startOfDay(a);
  const bb = startOfDay(b);
  return aa.getTime() < bb.getTime();
}

/**
 * @param {import('../../../calendar.js').BusyBlock[]} blocks
 * @param {Date} monthStart
 * @param {Date} today
 */
function renderMonthTable(blocks, monthStart, today) {
  const cells = buildMonthCells(monthStart, blocks);
  const title = monthLabel(monthStart);

  const head = WEEKDAYS.map(
    (d) =>
      `<th align="center" bgcolor="${COLORS.paper}" style="padding:6px 2px;font-size:11px;font-weight:600;color:${COLORS.inkSoft};border:1px solid ${COLORS.line};font-family:Georgia,'Times New Roman',serif;">${d}</th>`,
  ).join("");

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    const tds = week
      .map((cell) => {
        const dayNum = String(cell.date.getDate());
        const past = isBeforeDay(cell.date, today);
        const todayMark = isSameDay(cell.date, today);

        if (!cell.inMonth) {
          return `<td align="center" width="40" height="36" bgcolor="${COLORS.mutedBg}" style="padding:0;border:1px solid ${COLORS.line};font-size:12px;color:${COLORS.mutedText};font-family:Arial,Helvetica,sans-serif;">&nbsp;</td>`;
        }

        const status = cell.status; // booked | provisional | null (= open)
        let bg = COLORS.availableBg;
        let fg = COLORS.available;
        let label = "Open";

        if (status === "booked") {
          bg = COLORS.bookedBg;
          fg = COLORS.booked;
          label = "Unavailable";
        } else if (status === "provisional") {
          bg = COLORS.provisionalBg;
          fg = COLORS.provisional;
          label = "Provisional";
        }

        if (past) {
          bg = COLORS.mutedBg;
          fg = COLORS.mutedText;
        }

        const border = todayMark
          ? `2px solid ${COLORS.ink}`
          : `1px solid ${COLORS.line}`;
        const weight = todayMark ? "700" : "600";
        const titleAttr = escapeHtml(
          `${dayNum} ${title} — ${past ? "Past" : label}`,
        );

        return `<td align="center" width="40" height="36" bgcolor="${bg}" title="${titleAttr}" style="padding:0;border:${border};font-size:13px;font-weight:${weight};color:${fg};font-family:Arial,Helvetica,sans-serif;">${dayNum}</td>`;
      })
      .join("");
    rows.push(`<tr>${tds}</tr>`);
  }

  return `
<table role="presentation" width="294" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto 22px auto;">
  <tr>
    <td colspan="7" align="left" style="padding:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:${COLORS.ink};">${escapeHtml(title)}</td>
  </tr>
  <tr>${head}</tr>
  ${rows.join("\n  ")}
</table>`;
}

function legendSwatch(bg, fg, label) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle;margin:0 14px 8px 0;">
  <tr>
    <td width="12" height="12" bgcolor="${bg}" style="border:1px solid ${COLORS.line};font-size:1px;line-height:12px;">&nbsp;</td>
    <td style="padding-left:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${fg};">${escapeHtml(label)}</td>
  </tr>
</table>`;
}

/**
 * Open / provisional runs for plain-text fallback (next ~3 months).
 * @param {import('../../../calendar.js').BusyBlock[]} blocks
 */
export function offerableWindows(blocks) {
  const today = startOfDay(new Date());
  const daysAhead = 92;
  /** @type {{ type: 'available' | 'provisional', label: string }[]} */
  const items = [];
  /** @type {'available' | 'booked' | 'provisional' | null} */
  let runType = null;
  /** @type {Date | null} */
  let runStart = null;

  const flush = (endDay) => {
    if (runType === null || runStart === null) return;
    if (runType === "available" || runType === "provisional") {
      items.push({ type: runType, label: formatRange(runStart, endDay) });
    }
    runType = null;
    runStart = null;
  };

  for (let i = 0; i < daysAhead; i += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const status = dayStatus(blocks, day);
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

  return items;
}

/**
 * @param {{ displayName: string, siteUrl: string, blocks: import('../../../calendar.js').BusyBlock[] }} opts
 */
export function buildCalendarSnapshot(opts) {
  const { displayName, siteUrl, blocks } = opts;
  const today = startOfDay(new Date());
  const months = [];
  for (let i = 0; i < MONTHS; i += 1) {
    months.push(new Date(today.getFullYear(), today.getMonth() + i, 1));
  }
  const through = new Date(
    today.getFullYear(),
    today.getMonth() + MONTHS,
    0,
  );
  const rangeLabel = `${monthLabel(today)} – ${monthLabel(through)}`;
  const subject = `${displayName} — AV availability (${rangeLabel})`;

  const monthTables = months
    .map((m) => renderMonthTable(blocks, m, today))
    .join("\n");

  const windows = offerableWindows(blocks);
  const open = windows.filter((w) => w.type === "available");
  const provisional = windows.filter((w) => w.type === "provisional");

  /** Fragment for paste into compose windows (not a full HTML document). */
  const pasteHtml = `<div style="margin:0;padding:0;background-color:${COLORS.white};">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.white}" style="max-width:600px;width:100%;background-color:${COLORS.white};border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:600;color:${COLORS.ink};">
        ${escapeHtml(displayName)}
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.inkSoft};">
        Availability for AV / technical work — ${escapeHtml(rangeLabel)}.
        Colours match the live calendar: green open, amber provisional, rust unavailable.
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 8px 0;">
        ${legendSwatch(COLORS.availableBg, COLORS.available, "Open")}
        ${legendSwatch(COLORS.provisionalBg, COLORS.provisional, "Provisional")}
        ${legendSwatch(COLORS.bookedBg, COLORS.booked, "Unavailable")}
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0;">
        ${monthTables}
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${COLORS.ink};">
        <a href="${escapeHtml(siteUrl)}" style="color:${COLORS.available};font-weight:600;">View the live calendar and request dates</a>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${COLORS.inkSoft};">
        If the calendar layout looks odd in your client, open the live link above.
      </td>
    </tr>
  </table>
</div>`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${COLORS.white};">
${pasteHtml}
</body>
</html>`;

  const textLines = [
    `${displayName} — AV availability (${rangeLabel})`,
    ``,
    `OPEN — ready to book`,
    ...(open.length ? open.map((w) => `• ${w.label}`) : ["• None in this window."]),
    ``,
    `PROVISIONAL — soft hold; enquire to confirm`,
    ...(provisional.length
      ? provisional.map((w) => `• ${w.label}`)
      : ["• None in this window."]),
    ``,
    `Live calendar: ${siteUrl}`,
  ];

  return {
    subject,
    html,
    pasteHtml,
    text: textLines.join("\n"),
    rangeLabel,
    openCount: open.length,
    provisionalCount: provisional.length,
  };
}

export async function loadBusyBlocks() {
  const { fetchCalendarFeeds } = await import("../../fetch-calendar-feeds.mjs");
  const { unavailableIcs, provisionalIcs } = await fetchCalendarFeeds();
  return mergeCalendarFeeds(unavailableIcs, provisionalIcs);
}
