import { readFileSync } from "node:fs";
import { join } from "node:path";

const RULER_COLUMNS = 8;
const RULER_ROWS = ["A", "B", "C", "D"];
const TONE_MARKS = { good: "✓", bad: "✗", warn: "!", info: "i", neutral: "" };
const STEP_MARKS = { done: "✓", active: "●", todo: "○", failed: "✗", skipped: "–" };
const VERDICT_ORDER = ["fail", "warn", "skip", "pass"];
const VERDICT_LOOK = {
  fail: { mark: "✗", word: "сбой", tone: "bad" },
  warn: { mark: "!", word: "риск", tone: "warn" },
  skip: { mark: "–", word: "пропуск", tone: "neutral" },
  pass: { mark: "✓", word: "норма", tone: "good" },
};

let css;
export const sheetCss = () => (css ??= readFileSync(join(import.meta.dirname, "sheet.css"), "utf8"));

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const toneClass = (tone) => (tone ? ` tone-${tone}` : "");
const optional = (value, render) => (value === undefined ? "" : render(escape(value)));
const formatNumber = (value) => value.toLocaleString("ru-RU");
const percent = (value, max) => `${Math.max(0, Math.min(100, (value / max) * 100)).toFixed(2)}%`;

function mark(tone) {
  const sign = TONE_MARKS[tone];
  return sign ? `<span class="mark" aria-hidden="true">${sign}</span>` : "";
}

function ticksOf(max) {
  const raw = max / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw);
  const ticks = [];
  for (let at = 0; at <= max + step / 1000; at += step) ticks.push(Number(at.toFixed(6)));
  return ticks;
}

function treeList(children) {
  if (children.length === 0) return "";
  const items = children
    .map(
      (child) =>
        `<li>${optional(child.tag, (tag) => `<span class="tree-tag">${tag}</span>`)}<span class="tree-label">${escape(child.label)}</span>${optional(child.note, (note) => `<span class="tree-note">${note}</span>`)}${treeList(child.children)}</li>`,
    )
    .join("");
  return `<ul class="tree-list">${items}</ul>`;
}

const verdictBadge = (status) =>
  `<span class="verdict-badge tone-${VERDICT_LOOK[status].tone}"><span class="mark" aria-hidden="true">${VERDICT_LOOK[status].mark}</span>${VERDICT_LOOK[status].word}</span>`;

function verdicts({ items }) {
  const worst = VERDICT_ORDER.find((status) => items.some((item) => item.status === status));
  const counts = VERDICT_ORDER.map((status) => [status, items.filter((item) => item.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${VERDICT_LOOK[status].word} ${count}`)
    .join(" · ");
  const rows = [...items]
    .sort((left, right) => VERDICT_ORDER.indexOf(left.status) - VERDICT_ORDER.indexOf(right.status))
    .map(
      (item) =>
        `<li class="verdict-${item.status}">${verdictBadge(item.status)}<span class="verdict-title">${escape(item.title)}</span>${optional(item.evidence, (evidence) => `<span class="verdict-evidence">${evidence}</span>`)}</li>`,
    )
    .join("");
  return `<div class="w-verdicts" data-testid="widget-verdicts"><p class="verdict-total tone-${VERDICT_LOOK[worst].tone}">Итог: ${verdictBadge(worst)}<span class="verdict-counts">${counts}</span></p><ul>${rows}</ul></div>`;
}

const option = (item) =>
  `<li class="option${item.recommended ? " recommended" : ""}">${item.recommended ? `<span class="option-pick">Рекомендую</span>` : ""}<strong class="option-title">${escape(item.title)}</strong><p class="option-what">${escape(item.what)}</p>${optional(item.cost, (cost) => `<p class="option-fact"><span>Цена</span>${cost}</p>`)}${optional(item.risk, (risk) => `<p class="option-fact"><span>Риск</span>${risk}</p>`)}</li>`;

const RENDER = {
  verdicts,
  options: ({ items }) => `<ol class="w-options" data-testid="widget-options">${items.map(option).join("")}</ol>`,

  text: ({ text, muted }) => `<p class="w-text${muted ? " muted" : ""}">${escape(text)}</p>`,

  stats: ({ items }) =>
    `<div class="w-stats">${items
      .map(
        (item) => `<div class="stat${toneClass(item.tone)}" data-testid="widget-stat">
<span class="stat-label">${escape(item.label)}</span>
<span class="stat-value">${escape(item.value)}${optional(item.unit, (unit) => `<small>${unit}</small>`)}</span>
${optional(item.delta, (delta) => `<span class="stat-delta">${delta}</span>`)}${optional(item.note, (note) => `<span class="stat-note">${note}</span>`)}</div>`,
      )
      .join("")}</div>`,

  gauge: ({ items }) =>
    `<div class="w-gauge">${items
      .map((item) => {
        const over = item.limit !== undefined && item.value > item.limit;
        const unit = item.unit ? ` ${escape(item.unit)}` : "";
        const ticks = ticksOf(item.max)
          .map((at) => `<span style="left:${percent(at, item.max)}">${formatNumber(at)}</span>`)
          .join("");
        return `<div class="gauge${over ? " tone-bad" : ""}" data-testid="widget-gauge">
<div class="gauge-head"><span>${escape(item.label)}</span><span class="gauge-figure">${formatNumber(item.value)}${item.limit === undefined ? "" : ` / max ${formatNumber(item.limit)}`}${unit}</span></div>
<div class="gauge-track"><span class="gauge-fill" style="width:${percent(item.value, item.max)}"></span>${item.limit === undefined ? "" : `<span class="gauge-limit" style="left:${percent(item.limit, item.max)}"></span>`}</div>
<div class="gauge-ticks">${ticks}</div>${optional(item.note, (note) => `<p class="gauge-note">${note}</p>`)}</div>`;
      })
      .join("")}</div>`,

  bars: ({ items, unit }) => {
    const top = Math.max(...items.map((item) => item.value)) || 1;
    const suffix = unit ? ` ${escape(unit)}` : "";
    return `<div class="w-bars">${items
      .map(
        (item) =>
          `<div class="bar${toneClass(item.tone)}" data-testid="widget-bar"><span class="bar-label">${escape(item.label)}</span><span class="bar-track"><span style="width:${percent(item.value, top)}"></span></span><span class="bar-value">${formatNumber(item.value)}${suffix}</span></div>`,
      )
      .join("")}</div>`;
  },

  table: ({ columns, rows, note }) => {
    const head = columns.map((column) => `<th>${escape(column.title)}</th>`).join("");
    const body = rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell, index) => {
              const column = columns[index];
              const classes = [
                column.mono || cell.mono ? "mono" : "",
                column.align ? `align-${column.align}` : "",
                cell.tone ? `tone-${cell.tone}` : "",
              ].filter(Boolean);
              const content = cell.link
                ? `<a href="${escape(cell.link.href)}"${Object.entries(cell.link.data ?? {}).map(([name, value]) => ` data-${name}="${escape(value)}"`).join("")}>${escape(cell.text)}</a>`
                : escape(cell.text);
              return `<td${classes.length ? ` class="${classes.join(" ")}"` : ""}>${mark(cell.tone)}${content}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("");
    return `<div class="w-table"><table data-testid="widget-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${optional(note, (text) => `<p class="w-foot">${text}</p>`)}</div>`;
  },

  tree: ({ root }) =>
    `<div class="w-tree" data-testid="widget-tree"><div class="tree-root"><strong>${escape(root.label)}</strong>${optional(root.note, (note) => `<span>${note}</span>`)}</div>
<div class="tree-branches">${root.children
      .map(
        (branch) =>
          `<div class="tree-branch"><div class="tree-box">${optional(branch.tag, (tag) => `<span class="tree-tag">${tag}</span>`)}<strong>${escape(branch.label)}</strong>${optional(branch.note, (note) => `<span class="tree-note">${note}</span>`)}</div>${treeList(branch.children)}</div>`,
      )
      .join("")}</div></div>`,

  annotated: ({ label, caption, parts }) =>
    `<figure class="w-annotated" data-testid="widget-annotated">${label || caption ? `<figcaption>${optional(label, (text) => `<span>${text}</span>`)}${optional(caption, (text) => `<span class="mono muted">${text}</span>`)}</figcaption>` : ""}
<p class="annotated-line">${parts
      .map((part) =>
        part.note === undefined && part.tone === undefined
          ? `<span class="plain">${escape(part.text)}</span>`
          : `<span class="marked${toneClass(part.tone ?? "info")}"><span class="marked-text">${escape(part.text)}</span>${optional(part.note, (note) => `<span class="marked-note">${note}</span>`)}</span>`,
      )
      .join(" ")}</p></figure>`,

  timeline: ({ items }) =>
    `<ol class="w-timeline" data-testid="widget-timeline">${items
      .map(
        (item) =>
          `<li class="${toneClass(item.tone).trim()}"><span class="when">${escape(item.when)}</span><span class="dot"></span><span class="what">${escape(item.title)}</span>${optional(item.note, (note) => `<span class="note">${note}</span>`)}</li>`,
      )
      .join("")}</ol>`,

  steps: ({ items }) =>
    `<ol class="w-steps" data-testid="widget-steps">${items
      .map(
        (item) =>
          `<li class="step-${item.status}"><span class="step-mark" aria-hidden="true">${STEP_MARKS[item.status]}</span><span class="step-title">${escape(item.title)}</span>${optional(item.note, (note) => `<span class="step-note">${note}</span>`)}</li>`,
      )
      .join("")}</ol>`,

  list: ({ items, ordered }) => {
    const tag = ordered ? "ol" : "ul";
    return `<${tag} class="w-list">${items.map((item) => `<li>${escape(item)}</li>`).join("")}</${tag}>`;
  },

  keyvalue: ({ items }) =>
    `<dl class="w-keyvalue">${items.map((item) => `<div><dt>${escape(item.label)}</dt><dd>${escape(item.value)}</dd></div>`).join("")}</dl>`,

  callout: ({ tone, title, text }) =>
    `<aside class="w-callout tone-${tone}" data-testid="widget-callout">${optional(title, (heading) => `<strong>${heading}</strong>`)}<p>${escape(text)}</p></aside>`,

  diff: ({ file, lines }) =>
    `<figure class="w-diff">${optional(file, (name) => `<figcaption class="mono">${name}</figcaption>`)}<pre>${lines
      .map((line) => {
        const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : "same";
        return `<span class="diff-${kind}">${escape(line) || " "}</span>`;
      })
      .join("")}</pre></figure>`,

  code: ({ label, text }) =>
    `<figure class="w-code">${optional(label, (name) => `<figcaption class="mono">${name}</figcaption>`)}<pre>${escape(text)}</pre></figure>`,
};

const ruler = (cells, className) =>
  `<div class="ruler ${className}" aria-hidden="true">${cells.map((cell) => `<span>${cell}</span>`).join("")}</div>`;

const RULER_NUMBERS = Array.from({ length: RULER_COLUMNS }, (_, index) => index + 1);

export const frameOpen = (attributes = "") =>
  `<div class="frame">
${ruler(RULER_NUMBERS, "top")}
<div class="frame-middle">${ruler(RULER_ROWS, "side")}
<main class="sheet"${attributes}>`;

export const frameClose = () => `</main>${ruler(RULER_ROWS, "side")}</div>
${ruler(RULER_NUMBERS, "bottom")}
</div>`;

const HISTORY_CELL = `<div class="stamp-history" data-testid="sheet-history-cell" hidden>
<button class="stamp-history-button" type="button" data-testid="sheet-history" aria-expanded="false" aria-haspopup="true" aria-controls="sheet-history-menu">
<span class="stamp-eyebrow">История · <span class="stamp-history-count" data-count>·</span></span><span class="stamp-history-heading" data-heading>Листы дерева</span><span class="stamp-history-chevron" aria-hidden="true"></span><span class="stamp-history-place" data-place>листы дерева</span></button>
<div class="history-menu" id="sheet-history-menu" data-testid="sheet-history-menu" hidden>
<ol class="history-rows" data-rows></ol>
<button class="history-all" type="button" data-testid="sheet-history-all">Все листы →</button>
</div></div>
<div class="stamp-history stamp-download" data-testid="sheet-download-cell" hidden>
<button class="stamp-download-button" type="button" data-testid="sheet-download" title="Скачать HTML" aria-label="Скачать лист файлом HTML">
<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg></button>
</div>`;

const HISTORY_SCRIPT = `<script>
(() => {
  const cell = document.querySelector("[data-testid=sheet-history-cell]");
  const downloadCell = document.querySelector("[data-testid=sheet-download-cell]");
  if (window.parent === window) return [cell, downloadCell].forEach((node) => node.remove());
  const button = cell.querySelector("[data-testid=sheet-history]");
  const menu = cell.querySelector("[data-testid=sheet-history-menu]");
  const rows = cell.querySelector("[data-rows]");
  const count = cell.querySelector("[data-count]");
  const place = cell.querySelector("[data-place]");
  const heading = cell.querySelector("[data-heading]");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stamp = (at) => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const tell = (message) => parent.postMessage(message, "*");
  cell.hidden = false;
  downloadCell.hidden = false;
  downloadCell.querySelector("[data-testid=sheet-download]").addEventListener("click", () => tell({ type: "agent-ui:download" }));

  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) (rows.querySelector(".is-open") ?? rows.querySelector("button"))?.focus({ preventScroll: true });
  }

  function rowOf(entry, index) {
    const item = document.createElement("li");
    const row = Object.assign(document.createElement("button"), { type: "button", className: "history-row", title: entry.title });
    row.dataset.testid = "sheet-history-row";
    row.dataset.artifactId = entry.id;
    row.dataset.version = entry.version ?? "current";
    row.style.setProperty("--i", Math.min(index, 12));
    row.classList.toggle("is-open", entry.open);
    if (entry.open) row.setAttribute("aria-current", "page");
    row.classList.toggle("is-other", !entry.own);
    const parts = [["history-number", entry.number], ["history-title", entry.title], ["history-date", stamp(entry.at)]];
    for (const [className, text] of parts) row.append(Object.assign(document.createElement("span"), { className, textContent: text }));
    row.addEventListener("click", () => {
      setOpen(false);
      tell({ type: "agent-ui:history-open", id: entry.id, version: entry.version });
    });
    item.append(row);
    return item;
  }

  button.addEventListener("click", () => setOpen(menu.hidden));
  cell.querySelector("[data-testid=sheet-history-all]").addEventListener("click", () => tell({ type: "agent-ui:history-all" }));
  document.addEventListener("click", (event) => {
    if (!cell.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.hidden) return;
    setOpen(false);
    button.focus();
  });
  addEventListener("message", (event) => {
    if (event.source !== parent || event.data?.type !== "agent-ui:history-state") return;
    const text = String(event.data.entries.length);
    if (count.textContent !== text && !still) count.animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" });
    count.textContent = text;
    const branch = event.data.branch || "";
    const card = /lfs-([0-9]+)/i.exec(branch);
    heading.textContent = card ? "LFS-" + card[1] : branch || event.data.worktree || "Листы дерева";
    heading.title = branch;
    heading.dataset.kind = card ? "card" : "branch";
    place.textContent = (card ? branch : event.data.worktree) || "листы дерева";
    rows.replaceChildren(...event.data.entries.map(rowOf));
  });
  tell({ type: "agent-ui:history-ready" });
})();
</script>`;

export function renderSheet(sheet, { origin, history = false, kit }) {
  const panels = sheet.panels
    .map(
      (panel, index) => `<section class="panel span-${panel.span}" data-testid="sheet-panel">
<header><span class="panel-letter">${String.fromCharCode(65 + index)}</span><h2>${escape(panel.title)}</h2>${optional(panel.caption, (caption) => `<span class="panel-caption">${caption}</span>`)}</header>
<div class="panel-body">${panel.widgets.map((widget) => RENDER[widget.kind](widget)).join("\n")}</div></section>`,
    )
    .join("\n");
  const meta = sheet.meta.length ? RENDER.keyvalue({ items: sheet.meta }) : "";
  return `<!doctype html>
<html lang="ru" data-kit="v6"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(sheet.title)}</title>
${history ? `<base target="_top">
` : ""}${kit === undefined ? `<link rel="icon" type="image/svg+xml" href="${origin}/favicon.svg">
<link rel="stylesheet" href="${origin}/kit.css">` : `<style>${kit}</style>`}
<style>${sheetCss()}</style></head>
<body>${frameOpen()}
<header class="stamp" data-testid="sheet-stamp"><div class="stamp-title"><span class="stamp-eyebrow">Title</span><h1>${escape(sheet.title)}</h1>${optional(sheet.summary, (summary) => `<p>${summary}</p>`)}</div>${meta}${history ? HISTORY_CELL : ""}</header>
<div class="panels">${panels}</div>
${frameClose()}${history ? HISTORY_SCRIPT : ""}</body></html>`;
}
