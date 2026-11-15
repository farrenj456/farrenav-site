/**
 * Builds the live data for the availability page (run by .github/workflows/pages.yml):
 *   site/calendar.json                       the page's calendar (dates only)
 *   site/api/availability-snapshot/…         the copy-into-email calendar snapshot
 *
 * Needs ICS_URL / UNAVAILABLE_ICS_URL / PROVISIONAL_ICS_URL in the environment.
 * SITE_URL defaults to https://farrenav.co.uk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCalendarFeeds } from "./fetch-calendar-feeds.mjs";
import { handler as snapshotHandler } from "./snapshot/availability-snapshot.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
process.env.SITE_URL ||= "https://farrenav.co.uk";

const { unavailableIcs, provisionalIcs } = await fetchCalendarFeeds();
// Same shape the old /api/calendar returned, so the page reads it unchanged.
const payload = {
  source: "live",
  ics: unavailableIcs[0] || null,
  extraUnavailableIcs: unavailableIcs.slice(1),
  provisionalIcs: provisionalIcs || null,
};
fs.writeFileSync(path.join(site, "calendar.json"), JSON.stringify(payload));
console.log(`calendar.json: ${unavailableIcs.length} unavailable feed(s), provisional ${provisionalIcs ? "yes" : "no"}`);

const outDir = path.join(site, "api", "availability-snapshot");
fs.mkdirSync(outDir, { recursive: true });
const outputs = [
  ["index.html", undefined],
  ["email.html", "html"],
  ["email.txt", "text"],
  ["snapshot.json", "json"],
];
for (const [file, format] of outputs) {
  const result = await snapshotHandler({ queryStringParameters: format ? { format } : {} });
  if (result.statusCode !== 200) throw new Error(`Snapshot (${file}) failed: ${result.body.slice(0, 200)}`);
  fs.writeFileSync(path.join(outDir, file), result.body);
}
console.log("snapshot: built");
