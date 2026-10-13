import { randomBytes } from "node:crypto";
import { FAVICON_LINK } from "./favicon.mjs";
import { basename } from "node:path";
import { renderSheet } from "./sheet-page.mjs";

export const FRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-top-navigation-by-user-activation";

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function policyOf(nonce) {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "font-src data:",
    "img-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

const SHELL_CSS = `
:root{--paper:#fff;--sheet:#fbfbfa;--ink:#1c1c1c;--muted:#6b6b6b;--line:#d9d9d6;--frame:#1c1c1c;--stripe:#f4f4f2;--warn:#9a6200;--warn-soft:#fbf0d9;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#141414;--sheet:#1a1a1a;--ink:#ececea;--muted:#9b9b98;--line:#343432;--frame:#d6d6d3;--stripe:#202020;--warn:#e0b04f;--warn-soft:#30260f}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--paper);color:var(--ink);font:13px/1.4 system-ui,sans-serif}
body{display:flex;flex-direction:column}
iframe{display:block;border:0;width:100%;flex:1;background:var(--paper)}
#rev-tab{position:fixed;left:0;top:40px;z-index:3;width:16px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid var(--frame);border-left:0;background:var(--sheet);color:var(--muted);font:10px/1 var(--mono);letter-spacing:.08em;cursor:pointer}
#rev-tab:hover,#rev-tab[aria-expanded=true]{background:var(--stripe);color:var(--ink)}
#rev-tab:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
#rev-tab{width:20px}
.rev-label{writing-mode:vertical-rl;transform:rotate(180deg)}
.rev-count{font-weight:700;color:inherit}
#rev-panel{position:fixed;left:16px;top:40px;z-index:2;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 56px);overflow:auto;border:1px solid var(--frame);background:var(--sheet);box-shadow:0 8px 24px rgb(0 0 0/.12)}
#rev-panel header{display:flex;justify-content:space-between;align-items:baseline;padding:6px 10px;border-bottom:1px solid var(--frame);font:11px var(--mono);text-transform:uppercase;letter-spacing:.08em}
#rev-panel header a{color:var(--muted);text-transform:none;letter-spacing:0}
#rev-panel table{width:100%;border-collapse:collapse}
#rev-panel th{padding:4px 10px;border-bottom:1px solid var(--line);font:10px var(--mono);color:var(--muted);text-align:left;text-transform:uppercase}
#rev-panel td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
#rev-panel td:first-child{width:44px;font:12px var(--mono);border-right:1px solid var(--line)}
#rev-panel td:last-child{width:96px;font:11px var(--mono);color:var(--muted);white-space:nowrap}
#rev-panel tbody tr{cursor:pointer}
#rev-panel tbody tr:hover{background:var(--stripe);box-shadow:inset 3px 0 var(--muted)}
#rev-panel tbody tr:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
#rev-panel tbody tr.is-other td:nth-child(2){color:var(--muted)}
.rev-place{text-transform:none;letter-spacing:0;color:var(--muted)}
#rev-panel tbody tr.is-open,#rev-panel tbody tr.is-open:hover{background:var(--ink);color:var(--paper);box-shadow:none}
#rev-panel tbody tr.is-open td{color:var(--paper)}
#rev-note{flex:none;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 16px 6px 24px;border-bottom:1px solid var(--warn);background:var(--warn-soft);color:var(--warn);font:12px var(--mono)}
#rev-note[hidden],#rev-panel[hidden],#rev-tab[hidden]{display:none}
#rev-tab{transition:background-color .12s,color .12s,transform .12s}
#rev-tab:active{transform:translateX(2px)}
#rev-panel:not([hidden]){animation:rev-open .18s cubic-bezier(.2,.7,.2,1)}
#rev-note:not([hidden]){animation:rev-open .18s cubic-bezier(.2,.7,.2,1)}
@keyframes rev-open{from{opacity:0;transform:translateY(-6px)}}
#rev-panel tbody tr{transition:background-color .12s,box-shadow .12s}
#rev-back{transition:background-color .12s}
@media (prefers-reduced-motion:reduce){#rev-tab,#rev-panel,#rev-note,#rev-panel tbody tr,#rev-back{animation:none;transition:none}}
#rev-back{border:1px solid currentColor;background:transparent;color:inherit;font:inherit;padding:2px 10px;cursor:pointer}
#rev-back:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
`;

export function shellOf({ id, title }, { token }) {
  const nonce = randomBytes(16).toString("base64");
  const raw = `/a/${id}/raw`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policyOf(nonce)}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title || id)}</title>
${FAVICON_LINK}
<style nonce="${nonce}">${SHELL_CSS}</style></head>
<body>
<button id="rev-tab" type="button" hidden data-testid="revision-tab" aria-expanded="false" aria-controls="rev-panel" title="История листов этого дерева">
<span class="rev-label">ИСТОРИЯ</span><span id="rev-count" class="rev-count">0</span></button>
<aside id="rev-panel" data-testid="revision-panel" hidden aria-label="История листов этого дерева">
<header><span>История<span id="rev-place" class="rev-place" data-testid="revision-place"></span></span><a href="/a" data-testid="revision-all-pages">Все листы</a></header>
<table><thead><tr><th>№</th><th>Лист</th><th>Дата</th></tr></thead><tbody id="rev-rows"></tbody></table>
</aside>
<div id="rev-note" data-testid="revision-note" hidden><span id="rev-note-text"></span><button id="rev-back" type="button" data-testid="revision-back">К текущему</button></div>
<iframe id="frame" data-testid="artifact-frame" sandbox="${FRAME_SANDBOX}" src="${raw}" title="${escape(title || id)}"></iframe>
<script nonce="${nonce}">
const id = "${id}";
const raw = "${raw}";
const token = "${token}";
const frame = document.getElementById("frame");
const tab = document.getElementById("rev-tab");
const panel = document.getElementById("rev-panel");
const rows = document.getElementById("rev-rows");
const note = document.getElementById("rev-note");
let viewing = null;
let entries = [];
let framed = false;
let placeLabel = "";
let placeBranch = "";
let placeWorktree = "";

function sync() {
  const listed = entries.map((entry) => ({
    id: entry.id,
    version: entry.version,
    title: entry.title || entry.id,
    at: entry.at,
    number: numberOf(entry),
    current: entry.version === null,
    own: entry.id === id,
    open: entry.id === id && viewing === entry.version,
  }));
  frame.contentWindow?.postMessage({ type: "agent-ui:history-state", entries: listed, count: entries.length, open: !panel.hidden, place: placeLabel, branch: placeBranch, worktree: placeWorktree }, "*");
}

function download() {
  const href = "/a/" + id + "/download" + (viewing === null ? "" : "?version=" + viewing);
  Object.assign(document.createElement("a"), { href, download: id + ".html" }).click();
}

function openEntry(entry) {
  if (entry.id === id) return show(entry.version);
  location.href = entry.version === null ? "/a/" + entry.id : "/a/" + entry.id + "/history/" + entry.version;
}

async function ask({ quote, question, context }) {
  const reply = (result) => frame.contentWindow?.postMessage({ type: "agent-ui:explain-result", ...result }, "*");
  try {
    const response = await fetch("/a/" + id + "/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, quote, question, context, version: viewing }),
    });
    const body = await response.json();
    reply(response.ok ? { ok: true, status: body.status, id: body.id, listening: body.listening } : { ok: false, error: body.error });
  } catch {
    reply({ ok: false, error: "сервер agent-ui не ответил" });
  }
}

function load(src) {
  framed = false;
  frame.src = src;
}

function toggle(at) {
  panel.hidden = !panel.hidden;
  tab.setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden && at) {
    const box = frame.getBoundingClientRect();
    panel.style.left = Math.max(16, Math.min(box.left + at.left, innerWidth - panel.offsetWidth - 16)) + "px";
    panel.style.top = box.top + at.bottom + 6 + "px";
  } else if (!panel.hidden) panel.style.left = panel.style.top = "";
  sync();
}
const stamp = (at) => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const own = () => entries.filter((entry) => entry.id === id);

function show(version) {
  viewing = version;
  const old = own().find((entry) => entry.version === version && version !== null);
  load(old ? "/a/" + id + "/history/" + version : raw + "?v=" + Date.now());
  note.hidden = !old;
  if (old) document.getElementById("rev-note-text").textContent = "Версия " + version + " от " + stamp(old.at) + " — не текущий лист";
  render();
}

function numberOf(entry) {
  if (entry.version !== null) return String(entry.version);
  const latest = entries.find((other) => other.id === entry.id && other.version !== null);
  return String((latest?.version ?? 0) + 1);
}

function row(entry) {
  const tr = document.createElement("tr");
  tr.tabIndex = 0;
  tr.dataset.testid = "revision-row";
  tr.dataset.artifactId = entry.id;
  tr.dataset.version = entry.version ?? "current";
  if (entry.id === id && viewing === entry.version) {
    tr.className = "is-open";
    tr.setAttribute("aria-current", "page");
  }
  if (entry.id !== id) tr.classList.add("is-other");
  const name = entry.title || entry.id;
  for (const text of [numberOf(entry), name, stamp(entry.at)]) tr.append(Object.assign(document.createElement("td"), { textContent: text }));
  const open = () => openEntry(entry);
  tr.addEventListener("click", open);
  tr.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
  return tr;
}

function render() {
  document.getElementById("rev-count").textContent = entries.length;
  rows.replaceChildren(...entries.map(row));
  sync();
}

async function refresh() {
  const response = await fetch("/a/" + id + "/history", { headers: { accept: "application/json" } });
  if (!response.ok) return;
  const history = await response.json();
  entries = history.entries;
  const place = history.place;
  placeWorktree = place ? place.worktree.split("/").pop().split(String.fromCharCode(92)).pop() : "";
  placeBranch = place?.branch ?? "";
  placeLabel = place ? place.worktree.split("/").pop().split(String.fromCharCode(92)).pop() + (place.branch ? " · " + place.branch : "") : "";
  document.getElementById("rev-place").textContent = place ? " · " + place.worktree.split("/").pop().split(String.fromCharCode(92)).pop() + (place.branch ? " · " + place.branch : "") : "";
  render();
}

tab.addEventListener("click", () => toggle());
addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow) return;
  if (event.data?.type === "agent-ui:history-ready") {
    framed = true;
    tab.hidden = true;
    sync();
  }
  if (event.data?.type === "agent-ui:history-toggle") toggle(event.data);
  if (event.data?.type === "agent-ui:history-all") location.href = "/a";
  if (event.data?.type === "agent-ui:download") download();
  if (event.data?.type === "agent-ui:explain") ask(event.data);
  if (event.data?.type === "agent-ui:history-open") {
    const entry = entries.find((other) => other.id === event.data.id && other.version === event.data.version);
    if (entry) openEntry(entry);
  }
});
frame.addEventListener("load", () => setTimeout(() => { tab.hidden = framed; }, 150));
document.getElementById("rev-back").addEventListener("click", () => show(null));
const events = new EventSource("/a/" + id + "/events");
events.addEventListener("version", async () => {
  await refresh();
  if (viewing === null) load(raw + "?v=" + Date.now());
});
events.addEventListener("answer", (event) =>
  frame.contentWindow?.postMessage({ type: "agent-ui:explain-answer", ...JSON.parse(event.data) }, "*"));
refresh();
</script></body></html>`;
}

const stampOf = (at) => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const placeText = (place) => (place ? `${basename(place.worktree)}${place.branch ? ` · ${place.branch}` : ""}` : "—");

const indexSheet = ({ title, summary, panel, columns, rows, empty }) => ({
  title,
  summary,
  meta: [],
  panels: [
    {
      title: panel,
      span: 4,
      widgets: [rows.length ? { kind: "table", columns, rows } : { kind: "callout", tone: "info", text: empty }],
    },
  ],
});

export function listOf(artifacts, { origin }) {
  const rows = artifacts.map(({ id, title, at, place }) => [
    { text: title || id, link: { href: `/a/${id}`, data: { testid: "artifact-link", "artifact-id": id } } },
    { text: placeText(place), mono: true },
    { text: stampOf(at), mono: true },
    { text: "история", link: { href: `/a/${id}/history`, data: { testid: "artifact-history-link", "artifact-id": id } } },
  ]);
  const columns = [{ title: "Лист" }, { title: "Дерево · ветка", mono: true }, { title: "Изменён", mono: true }, { title: "" }];
  return renderSheet(
    indexSheet({ title: "Страницы агента", summary: `Листов: ${rows.length}.`, panel: "Все листы", columns, rows, empty: "Агент ещё не публиковал страниц." }),
    { origin },
  );
}

export function historyOf({ id, title, at, place, versions }, { origin }) {
  const rows = [
    [
      { text: String((versions[0]?.version ?? 0) + 1), mono: true },
      { text: `${title || id} — текущий`, link: { href: `/a/${id}`, data: { testid: "artifact-current-link" } } },
      { text: placeText(place), mono: true },
      { text: stampOf(at), mono: true },
    ],
    ...versions.map(({ version, title: previous, at: when, place: where }) => [
      { text: String(version), mono: true },
      { text: previous || id, link: { href: `/a/${id}/history/${version}`, data: { testid: "artifact-version-link", version } } },
      { text: placeText(where), mono: true },
      { text: stampOf(when), mono: true },
    ]),
  ];
  const columns = [{ title: "№", mono: true }, { title: "Содержание" }, { title: "Дерево · ветка", mono: true }, { title: "Дата", mono: true }];
  return renderSheet(
    indexSheet({ title: `История: ${title || id}`, summary: `Хранится до 20 прошлых версий. Прошлых версий: ${versions.length}.`, panel: "Версии листа", columns, rows, empty: "" }),
    { origin },
  );
}
