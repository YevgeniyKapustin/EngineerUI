import { escapeHtml, renderLink } from "./links.mjs";
import { sheetCss } from "./sheet-page.mjs";

// Update the shared v6 layout when serving saved HTML; preserve its source.
export function servedPage(html, { styles = false, at, place, related } = {}) {
  if (!/<html\b[^>]*\bdata-kit\s*=\s*["']v6["']/i.test(html)) return html;
  if (styles) html = html.replace(/<\/head\s*>/i, () => `<style data-agent-ui-layout>${sheetCss()}</style></head>`);
  if (at === undefined) return html;
  const stamp = new Date(at).toLocaleString("ru-RU", { timeZone: "Asia/Tbilisi", dateStyle: "short", timeStyle: "short" });
  const provenance = place ? `Каталог: ${place.worktree}${place.branch ? ` · ${place.branch}` : ""}` : "Каталог публикации не указан";
  const relatedLink = related ? renderLink(related.label, { href: `/a/${related.id}` }) : "";
  const info = `<aside class="publication" data-testid="publication-info"><span>Снимок публикации: <time datetime="${new Date(at).toISOString()}">${escapeHtml(stamp)} · Тбилиси</time></span><span>${escapeHtml(provenance)}</span>${relatedLink}</aside>`;
  return html.replace(/<body\b[^>]*>/i, (body) => body + info);
}
