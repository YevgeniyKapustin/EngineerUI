export function noteSheetOf(content, tone) {
  const [title, ...rest] = content.trim().split(/\r?\n/).map((line) => line.trim());
  const lines = rest.filter(Boolean);
  const facts = lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
  const prose = lines.filter((line) => !line.startsWith("- ")).join(" ");
  const callout = (text) => ({ kind: "callout", ...(tone && { tone }), text });
  const widgets = [];
  if (prose) widgets.push(callout(prose));
  if (facts.length) widgets.push({ kind: "list", items: facts });
  if (!widgets.length) widgets.push(callout(title));
  return { title, panels: [{ title: "Итог", span: 4, widgets }] };
}
