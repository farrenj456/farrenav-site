# farrenav.co.uk

Joey Farren's availability calendar, published with GitHub Pages.

- `site/`: the published site (calendar page, styles, enquiry form, `privacy/`).
- `tools/build.mjs`: fetches Apple Calendar, keeps only dates (no titles, places or notes), writes `site/calendar.json` and the email snapshot at `/api/availability-snapshot/`.
- `.github/workflows/pages.yml`: runs the build every 10 minutes and on every push, then publishes `site/`.

The iCloud calendar links are repository secrets (Settings → Secrets and variables → Actions):
`ICS_URL`, `UNAVAILABLE_ICS_URL` (unavailable) and `PROVISIONAL_ICS_URL` (provisional).

Enquiries are posted to `https://agent.farrenav.co.uk/hooks/enquiry` (Joey's private agent), which sends them to Telegram. If it can't be reached, the visitor's email app opens instead.

Email snapshot: open `https://farrenav.co.uk/api/availability-snapshot/` and use the copy buttons. Raw versions: `email.html`, `email.txt`, `snapshot.json` in the same folder.

Build locally (needs the three links in the environment): `node tools/build.mjs`
