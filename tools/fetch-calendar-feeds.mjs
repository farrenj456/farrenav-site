/**
 * Fetches the Apple Calendar feeds and strips everything except dates and times
 * (titles, locations, notes, attendees…), exactly as the old Netlify function did.
 *
 * The feed links are private and come only from environment variables, which the
 * GitHub Action fills from the repository's secrets:
 *   ICS_URL, UNAVAILABLE_ICS_URL (unavailable), PROVISIONAL_ICS_URL (soft holds)
 */
const SENSITIVE_PREFIXES = [
  "SUMMARY",
  "DESCRIPTION",
  "LOCATION",
  "URL",
  "ATTENDEE",
  "ORGANIZER",
  "CONTACT",
  "COMMENT",
  "X-APPLE-STRUCTURED-LOCATION",
  "X-APPLE-CREATOR-IDENTITY",
  "X-APPLE-CREATOR-TEAM-IDENTITY",
  "X-APPLE-TRAVEL",
  "GEO",
];

export function sanitizeIcs(ics) {
  const out = [];
  let skipping = false;
  for (const line of ics.split(/\r\n|\n|\r/)) {
    if (line[0] === " " || line[0] === "\t") {
      if (!skipping) out.push(line);
      continue;
    }
    const upper = line.toUpperCase();
    skipping = SENSITIVE_PREFIXES.some((p) => upper.startsWith(p));
    if (!skipping) out.push(line);
  }
  return out.join("\r\n") + "\r\n";
}

async function fetchSanitized(url) {
  if (!url) return null;
  const normalized = url.replace(/^webcal:/i, "https:");
  const response = await fetch(normalized, { headers: { "User-Agent": "AvailabilityPage/1.0" } });
  if (!response.ok) throw new Error(`A calendar feed returned ${response.status}`);
  const text = await response.text();
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("A calendar feed did not return a calendar");
  return sanitizeIcs(text);
}

let cached = null;

/** @returns {Promise<{ unavailableIcs: string[], provisionalIcs: string | null }>} */
export function fetchCalendarFeeds() {
  if (cached) return cached;
  const unavailableUrls = [process.env.ICS_URL, process.env.UNAVAILABLE_ICS_URL]
    .map((url) => String(url || "").trim())
    .filter(Boolean);
  const provisionalUrl = String(process.env.PROVISIONAL_ICS_URL || "").trim();
  if (!unavailableUrls.length && !provisionalUrl) {
    return Promise.reject(new Error("No calendar links set (ICS_URL, UNAVAILABLE_ICS_URL, PROVISIONAL_ICS_URL)"));
  }
  cached = Promise.all([
    Promise.all(unavailableUrls.map((url) => fetchSanitized(url))),
    fetchSanitized(provisionalUrl),
  ]).then(([unavailable, provisionalIcs]) => ({
    unavailableIcs: unavailable.filter(Boolean),
    provisionalIcs,
  }));
  return cached;
}
