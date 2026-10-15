import { fail, text } from "./fields.mjs";

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function safeHref(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || /^#[^\s]*$/.test(value)) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export function parseLink(value, where) {
  if (value === undefined) return undefined;
  const href = text(value?.href, `${where}.href`);
  if (!safeHref(href)) fail(`${where}.href`, "нужна ссылка http, https, /путь или #якорь");
  return { href };
}

export function renderLink(label, { href, data = {} }) {
  if (!safeHref(href)) return escapeHtml(label);
  const attrs = Object.entries(data).filter(([name]) => /^[a-z][a-z0-9-]*$/i.test(name))
    .map(([name, value]) => ` data-${name}="${escapeHtml(value)}"`).join("");
  return `<a href="${escapeHtml(href)}" target="_top" rel="noreferrer"${attrs}>${escapeHtml(label)}</a>`;
}

export function renderText(value) {
  const text = String(value), pattern = /https?:\/\/[^\s<>"'«»]+/gu;
  let html = "", at = 0;
  for (const match of text.matchAll(pattern)) {
    let url = match[0].replace(/[.,;!?…]+$/u, "");
    for (const [close, open] of [[")", "("], ["]", "["], ["}", "{"]]) {
      while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
    }
    html += escapeHtml(text.slice(at, match.index)) + renderLink(url, { href: url });
    at = match.index + url.length;
  }
  return html + escapeHtml(text.slice(at));
}
