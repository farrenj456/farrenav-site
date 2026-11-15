import {
  buildCalendarSnapshot,
  loadBusyBlocks,
} from "./lib/email-calendar-snapshot.js";
import { resolveDisplayName, resolveSiteUrl } from "./lib/site-meta.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function previewPage({ subject, html, pasteHtml, text, error }) {
  if (error) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Availability snapshot</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1c2421; }
  </style>
</head>
<body>
  <h1>Couldn’t build snapshot</h1>
  <p>${escapeHtml(error)}</p>
</body>
</html>`;
  }

  const subjectEsc = escapeHtml(subject);
  const payload = JSON.stringify({
    subject,
    html,
    pasteHtml: pasteHtml || html,
    text,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email snapshot — ${subjectEsc}</title>
  <style>
    :root {
      --ink: #1c2421;
      --ink-soft: #4a5752;
      --paper: #f3f6f4;
      --line: rgba(28, 36, 33, 0.12);
      --available: #2f6b57;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.45;
    }
    .bar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      padding: 0.85rem 1.25rem;
      background: rgba(255,255,255,0.92);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(8px);
    }
    .bar h1 {
      margin: 0;
      font-family: Georgia, serif;
      font-size: 1.05rem;
      font-weight: 600;
      flex: 1 1 auto;
      min-width: 12rem;
    }
    .bar button {
      appearance: none;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 999px;
      padding: 0.45rem 0.9rem;
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .bar button:hover { border-color: var(--available); }
    .bar button.primary {
      background: var(--ink);
      color: #fff;
      border-color: var(--ink);
    }
    .bar .status {
      font-size: 0.85rem;
      color: var(--ink-soft);
      min-width: 6rem;
    }
    .meta {
      max-width: 640px;
      margin: 1.25rem auto 0;
      padding: 0 1rem;
      color: var(--ink-soft);
      font-size: 0.95rem;
    }
    .meta strong { color: var(--ink); }
    .meta ol {
      margin: 0.6rem 0 0;
      padding-left: 1.25rem;
    }
    .meta li { margin: 0.25rem 0; }
    .frame-wrap {
      max-width: 640px;
      margin: 1rem auto 3rem;
      padding: 0 1rem;
    }
    iframe.frame {
      display: block;
      width: 100%;
      min-height: 920px;
      border: 0;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="bar">
    <h1>Email calendar snapshot</h1>
    <button type="button" class="primary" id="copy-rich">Copy for email</button>
    <button type="button" id="copy-text">Copy plain text</button>
    <button type="button" id="copy-subject">Copy subject</button>
    <span class="status" id="status" aria-live="polite"></span>
  </div>
  <div class="meta">
    <p>Subject: <strong id="subject-label">${subjectEsc}</strong></p>
    <ol>
      <li>Click <strong>Copy for email</strong> (this puts formatted HTML on the clipboard — not the source code).</li>
      <li>Open a <strong>new message</strong> in Gmail or Outlook with rich text / formatting <strong>on</strong> (not plain text mode).</li>
      <li>Paste into the body (<kbd>⌘V</kbd> / <kbd>Ctrl+V</kbd>). You should see the coloured calendar, not <code>&lt;table&gt;</code> tags.</li>
    </ol>
    <p>If it still pastes as code: click once inside the preview below, press <kbd>⌘A</kbd> then <kbd>⌘C</kbd>, then paste into the email.</p>
  </div>
  <div class="frame-wrap">
    <iframe class="frame" id="preview" title="Email preview"></iframe>
  </div>
  <script type="application/json" id="payload">${payload.replace(/</g, "\\u003c")}</script>
  <script>
    const payload = JSON.parse(document.getElementById("payload").textContent);
    const frame = document.getElementById("preview");
    frame.srcdoc = payload.html;
    const statusEl = document.getElementById("status");
    function flash(msg) {
      statusEl.textContent = msg;
      setTimeout(function () {
        if (statusEl.textContent === msg) statusEl.textContent = "";
      }, 2800);
    }
    async function copyText(value, label) {
      try {
        await navigator.clipboard.writeText(value);
        flash("Copied " + label);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flash("Copied " + label);
      }
    }
    function copyFromPreview() {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return false;
      const sel = frame.contentWindow.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(doc.body);
      sel.removeAllRanges();
      sel.addRange(range);
      frame.contentWindow.focus();
      const ok = doc.execCommand("copy");
      sel.removeAllRanges();
      return ok;
    }
    async function copyRich() {
      const html = payload.pasteHtml || payload.html;
      const plain = payload.text;
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" }),
            }),
          ]);
          flash("Copied — paste into email");
          return;
        }
      } catch (err) {
        /* fall through */
      }
      if (copyFromPreview()) {
        flash("Copied from preview — paste into email");
        return;
      }
      flash("Select preview, ⌘A ⌘C, then paste");
    }
    document.getElementById("copy-rich").addEventListener("click", function () {
      copyRich();
    });
    document.getElementById("copy-text").addEventListener("click", function () {
      copyText(payload.text, "plain text");
    });
    document.getElementById("copy-subject").addEventListener("click", function () {
      copyText(payload.subject, "subject");
    });
  </script>
</body>
</html>`;
}

export async function handler(event) {
  const format = (event.queryStringParameters || {}).format;
  const wantsRaw = format === "html" || format === "text" || format === "json";

  try {
    const siteUrl = resolveSiteUrl(event);
    const displayName = resolveDisplayName();
    const blocks = await loadBusyBlocks();
    const snapshot = buildCalendarSnapshot({ displayName, siteUrl, blocks });

    if (format === "html") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: snapshot.html,
      };
    }
    if (format === "text") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: snapshot.text,
      };
    }
    if (format === "json") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: snapshot.subject,
          rangeLabel: snapshot.rangeLabel,
          openCount: snapshot.openCount,
          provisionalCount: snapshot.provisionalCount,
          text: snapshot.text,
          html: snapshot.html,
          pasteHtml: snapshot.pasteHtml,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: previewPage(snapshot),
    };
  } catch (error) {
    console.error("availability-snapshot:", error);
    const message =
      error instanceof Error ? error.message : "Snapshot failed";
    if (wantsRaw) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: message }),
      };
    }
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: previewPage({ error: message }),
    };
  }
}
