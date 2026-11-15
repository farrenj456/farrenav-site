import {
  buildMonthCells,
  dayStatus,
  demoBusyBlocks,
  formatRange,
  isSameDay,
  mergeCalendarFeeds,
  upcomingSummary,
} from "./calendar.js";

const config = {
  name: window.AVAILABILITY_CONFIG?.displayName || "Availability",
  tagline: window.AVAILABILITY_CONFIG?.tagline || "Open and unavailable dates",
  email: window.AVAILABILITY_CONFIG?.contactEmail || "",
  icsUrl: (window.AVAILABILITY_CONFIG?.icsUrl || "").trim(),
  unavailableIcsUrl: (window.AVAILABILITY_CONFIG?.unavailableIcsUrl || "").trim(),
  provisionalIcsUrl: (window.AVAILABILITY_CONFIG?.provisionalIcsUrl || "").trim(),
  corsProxy: window.AVAILABILITY_CONFIG?.corsProxy ?? "",
  calendarDataUrl: window.AVAILABILITY_CONFIG?.calendarDataUrl || "calendar.json",
  enquiryUrl: (window.AVAILABILITY_CONFIG?.enquiryUrl || "").trim(),
};

const brandEl = document.getElementById("brand");
const taglineEl = document.getElementById("tagline");
const monthLabelEl = document.getElementById("month-label");
const dayGridEl = document.getElementById("day-grid");
const statusEl = document.getElementById("status");
const upcomingEl = document.getElementById("upcoming-list");
const footerEl = document.getElementById("footer-note");
const prevBtn = document.getElementById("prev-month");
const nextBtn = document.getElementById("next-month");
const enquiryForm = document.getElementById("enquiry-form");
const datesHidden = document.getElementById("dates-hidden");
const rangeFrom = document.getElementById("range-from");
const rangeTo = document.getElementById("range-to");
const addDatesBtn = document.getElementById("add-dates");
const groupsListEl = document.getElementById("selected-groups-list");
const groupsEmptyEl = document.getElementById("selected-groups-empty");
const formStatus = document.getElementById("form-status");
const submitBtn = document.getElementById("enquiry-submit");

brandEl.textContent = config.name;
taglineEl.textContent = config.tagline;
document.title = `${config.name} · Availability`;

/** @type {import('./calendar.js').BusyBlock[]} */
let busyBlocks = [];
let viewMonth = startOfMonth(new Date());
/** @type {Set<string>} YYYY-MM-DD */
let pickedDates = new Set();

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

function isPast(date) {
  return startOfDay(date) < startOfDay(new Date());
}

function isSelectable(cell) {
  if (cell.status === "booked") return false;
  if (isPast(cell.date)) return false;
  return true;
}

function formatDateLabel(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatGroupLabel(keys) {
  const dates = keys.map(parseDateKey);
  if (dates.length === 1) return formatDateLabel(dates[0]);
  return formatRange(dates[0], dates[dates.length - 1]);
}

/**
 * Split sorted YYYY-MM-DD keys into contiguous day runs.
 * @param {Iterable<string>} keys
 * @returns {string[][]}
 */
function contiguousRuns(keys) {
  const sorted = [...keys].sort();
  if (!sorted.length) return [];

  /** @type {string[][]} */
  const runs = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = parseDateKey(sorted[i - 1]);
    const expected = new Date(prev);
    expected.setDate(expected.getDate() + 1);
    if (dateKey(expected) === sorted[i]) {
      current.push(sorted[i]);
    } else {
      runs.push(current);
      current = [sorted[i]];
    }
  }
  runs.push(current);
  return runs;
}

/** Groups derived from consecutive selected dates. */
function dateGroups() {
  return contiguousRuns(pickedDates).map((dates, index) => ({
    id: `g${index}-${dates[0]}`,
    dates,
  }));
}

function collectSelectableKeys(from, to) {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  /** @type {string[]} */
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const status = dayStatus(busyBlocks, cursor);
    if (status !== "booked" && !isPast(cursor)) {
      keys.push(dateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function syncSelectionUi() {
  if (!datesHidden) return;

  const groups = dateGroups();
  datesHidden.value = groups.length
    ? groups.map((group) => formatGroupLabel(group.dates)).join(" · ")
    : "";
  // Exact days (YYYY-MM-DD) so an accepted enquiry becomes a job with the right dates.
  const dateKeysHidden = document.getElementById("date-keys-hidden");
  if (dateKeysHidden) dateKeysHidden.value = [...pickedDates].sort().join(",");

  renderGroupsList(groups);
}

function renderGroupsList(groups = dateGroups()) {
  if (!groupsListEl || !groupsEmptyEl) return;
  groupsListEl.replaceChildren();

  if (!groups.length) {
    groupsEmptyEl.hidden = false;
    return;
  }

  groupsEmptyEl.hidden = true;

  for (const group of groups) {
    const li = document.createElement("li");
    li.className = "selected-group";

    const label = document.createElement("p");
    label.className = "selected-group-label";
    label.textContent = formatGroupLabel(group.dates);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "selected-group-remove";
    remove.setAttribute("aria-label", `Remove ${formatGroupLabel(group.dates)}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => removeGroup(group.dates));

    li.append(label, remove);
    groupsListEl.append(li);
  }
}

function removeGroup(keys) {
  for (const key of keys) pickedDates.delete(key);
  setFormStatus("");
  syncSelectionUi();
  render();
}

function togglePickedDate(date) {
  const key = dateKey(date);
  if (pickedDates.has(key)) pickedDates.delete(key);
  else pickedDates.add(key);
  setFormStatus("");
  syncSelectionUi();
  render();
}

function addRangeFromInputs() {
  if (!rangeFrom?.value || !rangeTo?.value) {
    setFormStatus("Set both From and To, then click Add dates.", "error");
    return;
  }

  const from = parseDateKey(rangeFrom.value);
  const to = parseDateKey(rangeTo.value);
  const keys = collectSelectableKeys(from, to);

  if (!keys.length) {
    setFormStatus("No available dates in that range.", "error");
    return;
  }

  const before = pickedDates.size;
  for (const key of keys) pickedDates.add(key);

  if (pickedDates.size === before) {
    setFormStatus("Those dates are already selected.", "error");
    return;
  }

  rangeFrom.value = "";
  rangeTo.value = "";
  setFormStatus("");
  syncSelectionUi();
  render();
}

const STATUS_LABEL = {
  booked: "unavailable",
  provisional: "provisional",
  available: "available",
};

const BADGE_LABEL = {
  booked: "Unavailable",
  provisional: "Provisional",
  available: "Open",
};

async function fetchCalendarPayload() {
  try {
    // calendar.json is rebuilt from Apple Calendar every 10 minutes by a GitHub Action.
    // The time in the query skips stale browser copies.
    const local = await fetch(`${config.calendarDataUrl}?t=${Date.now()}`, { cache: "no-store" });
    const type = local.headers.get("content-type") || "";
    if (local.ok && type.includes("application/json")) {
      const payload = await local.json();
      if (payload.source === "live") {
        const extras = Array.isArray(payload.extraUnavailableIcs)
          ? payload.extraUnavailableIcs
          : payload.extraUnavailableIcs
            ? [payload.extraUnavailableIcs]
            : [];
        return {
          via: "proxy",
          unavailableIcs: [payload.ics, ...extras].filter(Boolean),
          provisionalIcs: payload.provisionalIcs || null,
        };
      }
      if (payload.source === "demo") {
        return { via: "demo", unavailableIcs: [], provisionalIcs: null };
      }
    }
  } catch {
    // Static hosting without an API — fall through
  }

  if (!config.icsUrl && !config.unavailableIcsUrl && !config.provisionalIcsUrl) {
    return { via: "demo", unavailableIcs: [], provisionalIcs: null };
  }

  const loadOne = async (url) => {
    if (!url) return null;
    const icsUrl = url.replace(/^webcal:/i, "https:");
    const fetchUrl = config.corsProxy
      ? `${config.corsProxy}${encodeURIComponent(icsUrl)}`
      : icsUrl;
    const response = await fetch(fetchUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Calendar feed returned ${response.status}`);
    }
    const text = await response.text();
    if (text.trimStart().startsWith("{")) {
      try {
        const wrapped = JSON.parse(text);
        if (wrapped.contents) return wrapped.contents;
        if (wrapped.ics) return wrapped.ics;
      } catch {
        // treat as raw ICS
      }
    }
    return text;
  };

  return {
    via: "live",
    unavailableIcs: (
      await Promise.all([
        loadOne(config.icsUrl),
        loadOne(config.unavailableIcsUrl),
      ])
    ).filter(Boolean),
    provisionalIcs: await loadOne(config.provisionalIcsUrl),
  };
}

async function loadCalendar() {
  statusEl.textContent = "Syncing calendar…";

  try {
    const { unavailableIcs, provisionalIcs, via } = await fetchCalendarPayload();

    if (via === "demo" || (!unavailableIcs.length && !provisionalIcs)) {
      busyBlocks = demoBusyBlocks();
      statusEl.textContent =
        "Showing sample dates. Add your public Apple Calendar links in config.js to go live.";
      footerEl.textContent =
        "Demo mode — connect public Apple Calendar ICS feeds to show real dates.";
    } else {
      busyBlocks = mergeCalendarFeeds(unavailableIcs, provisionalIcs);
      const updated = new Date().toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      statusEl.textContent = `Updated ${updated}`;
      footerEl.textContent =
        "Dates sync from Apple Calendar. Unavailable dates override provisional holds.";
    }
  } catch (error) {
    busyBlocks = demoBusyBlocks();
    statusEl.textContent =
      error instanceof Error
        ? `Couldn’t reach the calendar feed (${error.message}). Showing sample dates.`
        : "Couldn’t reach the calendar feed. Showing sample dates.";
    footerEl.textContent =
      "Demo fallback — check your ICS URLs in config.js and try again.";
  }

  render();
}

function render() {
  monthLabelEl.textContent = viewMonth.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const cells = buildMonthCells(viewMonth, busyBlocks);
  const today = new Date();
  dayGridEl.replaceChildren();

  for (const cell of cells) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-cell";
    btn.setAttribute("role", "gridcell");

    if (!cell.inMonth) btn.classList.add("outside");
    if (isSameDay(cell.date, today)) btn.classList.add("is-today");

    if (cell.status === "booked") btn.classList.add("is-booked");
    else if (cell.status === "provisional") btn.classList.add("is-provisional");
    else if (cell.inMonth && !isPast(cell.date)) btn.classList.add("is-available");

    if (pickedDates.has(dateKey(cell.date))) btn.classList.add("is-picked");

    const num = document.createElement("span");
    num.className = "day-num";
    num.textContent = String(cell.date.getDate());
    btn.append(num);

    const statusKey = cell.status || "available";
    if (cell.status) {
      const mark = document.createElement("span");
      mark.className = "day-mark";
      mark.setAttribute("aria-hidden", "true");
      btn.append(mark);
    }

    const selected = pickedDates.has(dateKey(cell.date));
    btn.setAttribute(
      "aria-label",
      `${cell.date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })} — ${STATUS_LABEL[statusKey]}${selected ? ", selected" : ""}`,
    );

    if (isSelectable(cell)) {
      btn.addEventListener("click", () => togglePickedDate(cell.date));
    } else {
      btn.disabled = true;
    }

    dayGridEl.append(btn);
  }

  renderUpcoming();
}

function renderUpcoming() {
  const items = upcomingSummary(busyBlocks, 60);
  upcomingEl.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "upcoming-empty";
    empty.textContent = "No upcoming dates in range.";
    upcomingEl.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = `upcoming-item ${item.type}`;
    row.dataset.start = item.start.toISOString();

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = BADGE_LABEL[item.type];

    const label = document.createElement("p");
    label.className = "upcoming-label";
    label.textContent = item.label;

    row.append(badge, label);
    upcomingEl.append(row);
  }
}

function setFormStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = `form-status${type ? ` is-${type}` : ""}`;
}

function buildMailtoUrl(formData) {
  const name = formData.get("name");
  const email = formData.get("email")?.trim() || "—";
  const company = formData.get("company");
  const role = formData.get("role") || "—";
  const groups = dateGroups();

  const body = [
    "Availability enquiry",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company}`,
    `Role: ${role}`,
    "",
    "Requested date groups:",
    ...groups.map((group, i) => `${i + 1}. ${formatGroupLabel(group.dates)}`),
  ].join("\n");

  return `mailto:${config.email}?subject=${encodeURIComponent(`Availability enquiry — ${company}`)}&body=${encodeURIComponent(body)}`;
}

async function submitEnquiry(event) {
  event.preventDefault();
  if (!enquiryForm || !submitBtn) return;

  if (!pickedDates.size) {
    setFormStatus("Please select at least one date.", "error");
    return;
  }

  if (!config.email) {
    setFormStatus("Contact email is not configured.", "error");
    return;
  }

  syncSelectionUi();
  submitBtn.disabled = true;
  setFormStatus("Sending…");

  const formData = new FormData(enquiryForm);

  try {
    if (!config.enquiryUrl) throw new Error("No enquiry address");
    // Sent to Joey's agent, which forwards it to Telegram.
    const response = await fetch(config.enquiryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString(),
    });

    if (response.status === 400) {
      const problem = await response.json().catch(() => ({}));
      setFormStatus(problem.error || "Please check the form and try again.", "error");
      submitBtn.disabled = false;
      return;
    }

    if (response.ok) {
      setFormStatus("Enquiry sent — Joey will be in touch shortly.", "success");
      enquiryForm.reset();
      pickedDates.clear();
      syncSelectionUi();
      render();
      submitBtn.disabled = false;
      return;
    }
  } catch {
    // Agent unreachable — fall through to the visitor's email app
  }

  window.location.href = buildMailtoUrl(formData);
  setFormStatus("Opening your email app to send the enquiry…", "success");
  submitBtn.disabled = false;
}

prevBtn.addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  render();
});

nextBtn.addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  render();
});

rangeFrom?.addEventListener("change", () => setFormStatus(""));
rangeTo?.addEventListener("change", () => setFormStatus(""));
addDatesBtn?.addEventListener("click", addRangeFromInputs);
enquiryForm?.addEventListener("submit", submitEnquiry);

syncSelectionUi();
loadCalendar();
setInterval(loadCalendar, 10 * 60 * 1000);
