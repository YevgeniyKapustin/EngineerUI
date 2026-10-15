import { fail, list, number, oneOf, text } from "./fields.mjs";
import { checkSte, prose, proses } from "./ste.mjs";
import { parseLink } from "./links.mjs";

const TONES = ["good", "bad", "warn", "info", "neutral"];
const STEP_STATES = ["done", "active", "todo", "failed", "skipped"];
const VERDICTS = ["pass", "warn", "fail", "skip"];
const SPANS =[1, 2, 3, 4];
const TREE_DEPTH = 4;

function object(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(where, "нужен объект");
  return value;
}

const tone = (value, where) => oneOf(value, TONES, where, { optional: true });

function cell(value, where) {
  if (typeof value === "string" || typeof value === "number") return { text: checkSte(String(value), where) };
  const given = object(value, where);
  return {
    text: given.mono === true ? String(given.text ?? "") : checkSte(String(given.text ?? ""), `${where}.text`),
    tone: tone(given.tone, `${where}.tone`),
    mono: given.mono === true,
    link: parseLink(given.link, `${where}.link`),
  };
}

function column(value, where) {
  const titleOf = (title, at) => (title === "" ? "" : text(title, at));
  if (typeof value === "string") return { title: titleOf(value, where) };
  const given = object(value, where);
  return {
    title: titleOf(given.title, `${where}.title`),
    mono: given.mono === true,
    align: oneOf(given.align, ["left", "right", "center"], `${where}.align`, { optional: true }),
  };
}

function node(value, where, depth) {
  const given = object(value, where);
  if (depth > TREE_DEPTH) fail(where, `дерево глубже ${TREE_DEPTH} уровней`);
  return {
    label: text(given.label, `${where}.label`),
    tag: text(given.tag, `${where}.tag`, { optional: true }),
    note: prose(given.note, `${where}.note`, { optional: true }),
    children:
      given.children === undefined
        ? []
        : list(given.children, `${where}.children`, (child, at) => node(child, at, depth + 1)),
  };
}

function gaugeItem(value, where) {
  const given = object(value, where);
  const max = number(given.max, `${where}.max`);
  if (max <= 0) fail(`${where}.max`, "нужно число больше нуля");
  return {
    label: text(given.label, `${where}.label`),
    value: number(given.value, `${where}.value`),
    max,
    limit: number(given.limit, `${where}.limit`, { optional: true }),
    unit: text(given.unit, `${where}.unit`, { optional: true }),
    note: prose(given.note, `${where}.note`, { optional: true }),
  };
}

export const WIDGETS = {
  text: (given, where) => ({ text: prose(given.text, `${where}.text`), muted: given.muted === true }),

  stats: (given, where) => ({
    items: list(given.items, `${where}.items`, (item, at) => {
      const stat = object(item, at);
      return {
        label: text(stat.label, `${at}.label`),
        value: String(stat.value ?? fail(`${at}.value`, "нужно значение")),
        unit: text(stat.unit, `${at}.unit`, { optional: true }),
        delta: text(stat.delta, `${at}.delta`, { optional: true }),
        tone: tone(stat.tone, `${at}.tone`),
        note: prose(stat.note, `${at}.note`, { optional: true }),
      };
    }),
  }),

  gauge: (given, where) => ({ items: list(given.items, `${where}.items`, gaugeItem) }),

  bars: (given, where) => ({
    unit: text(given.unit, `${where}.unit`, { optional: true }),
    items: list(given.items, `${where}.items`, (item, at) => {
      const bar = object(item, at);
      const value = number(bar.value, `${at}.value`);
      if (value < 0) fail(`${at}.value`, "нужно неотрицательное число");
      return { label: text(bar.label, `${at}.label`), value, tone: tone(bar.tone, `${at}.tone`) };
    }),
  }),

  table: (given, where) => {
    const columns = list(given.columns, `${where}.columns`, column);
    const rows = list(given.rows, `${where}.rows`, (row, at) => {
      if (!Array.isArray(row) || row.length !== columns.length) fail(at, `нужно ${columns.length} ячеек`);
      return row.map((value, index) => cell(value, `${at}[${index}]`));
    });
    return { columns, rows, note: prose(given.note, `${where}.note`, { optional: true }) };
  },

  tree: (given, where) => ({ root: node(given.root, `${where}.root`, 1) }),

  annotated: (given, where) => ({
    label: text(given.label, `${where}.label`, { optional: true }),
    caption: prose(given.caption, `${where}.caption`, { optional: true }),
    parts: list(given.parts, `${where}.parts`, (part, at) => {
      if (typeof part === "string") return { text: part };
      const marked = object(part, at);
      return {
        text: text(marked.text, `${at}.text`),
        note: prose(marked.note, `${at}.note`, { optional: true }),
        tone: tone(marked.tone, `${at}.tone`),
      };
    }),
  }),

  timeline: (given, where) => ({
    items: list(given.items, `${where}.items`, (item, at) => {
      const point = object(item, at);
      return {
        when: text(point.when, `${at}.when`),
        title: prose(point.title, `${at}.title`),
        note: prose(point.note, `${at}.note`, { optional: true }),
        tone: tone(point.tone, `${at}.tone`),
      };
    }),
  }),

  steps: (given, where) => ({
    items: list(given.items, `${where}.items`, (item, at) => {
      const step = object(item, at);
      return {
        title: prose(step.title, `${at}.title`),
        status: oneOf(step.status, STEP_STATES, `${at}.status`),
        note: prose(step.note, `${at}.note`, { optional: true }),
      };
    }),
  }),

  verdicts: (given, where) => ({
    items: list(given.items, `${where}.items`, (item, at) => {
      const verdict = object(item, at);
      return {
        title: prose(verdict.title, `${at}.title`),
        status: oneOf(verdict.status, VERDICTS, `${at}.status`),
        evidence: prose(verdict.evidence, `${at}.evidence`, { optional: true }),
      };
    }),
  }),

  options: (given, where) => {
    const items = list(given.items, `${where}.items`, (item, at) => {
      const option = object(item, at);
      return {
        title: prose(option.title, `${at}.title`),
        what: prose(option.what, `${at}.what`),
        cost: prose(option.cost, `${at}.cost`, { optional: true }),
        risk: prose(option.risk, `${at}.risk`, { optional: true }),
        recommended: option.recommended === true,
      };
    });
    if (items.filter((option) => option.recommended).length > 1)
      fail(`${where}.items`, "рекомендуй не больше одного варианта");
    return { items };
  },

  list: (given, where) => ({ items: proses(given.items, `${where}.items`), ordered: given.ordered === true }),

  keyvalue: (given, where) => ({
    items: list(given.items, `${where}.items`, (item, at) => {
      if (Array.isArray(item) && item.length === 2)
        return { label: text(item[0], `${at}[0]`), value: String(item[1]) };
      const pair = object(item, at);
      return { label: text(pair.label, `${at}.label`), value: String(pair.value ?? "") };
    }),
  }),

  callout: (given, where) => ({
    tone: tone(given.tone, `${where}.tone`) ?? "info",
    title: prose(given.title, `${where}.title`, { optional: true }),
    text: prose(given.text, `${where}.text`),
  }),

  diff: (given, where) => ({
    file: text(given.file, `${where}.file`, { optional: true }),
    lines: list(given.lines, `${where}.lines`, (line, at) => {
      if (typeof line !== "string") fail(at, "нужна строка");
      return line;
    }),
  }),

  code: (given, where) => ({
    label: text(given.label, `${where}.label`, { optional: true }),
    text: text(given.text, `${where}.text`),
  }),
};

function widget(value, where) {
  const given = object(value, where);
  const parse = WIDGETS[given.kind];
  if (!parse) fail(`${where}.kind`, `неизвестный виджет, есть: ${Object.keys(WIDGETS).join(", ")}`);
  return { kind: given.kind, ...parse(given, where) };
}

export function parseSheet(input) {
  const sheet = object(input, "sheet");
  const panels = list(sheet.panels, "sheet.panels", (value, where) => {
    const panel = object(value, where);
    return {
      title: prose(panel.title, `${where}.title`),
      caption: prose(panel.caption, `${where}.caption`, { optional: true }),
      span: oneOf(panel.span ?? 2, SPANS, `${where}.span`),
      widgets: list(panel.widgets, `${where}.widgets`, widget),
    };
  });
  if (panels.length > 26) fail("sheet.panels", "не больше 26 панелей");
  return {
    title: prose(sheet.title, "sheet.title"),
    summary: prose(sheet.summary, "sheet.summary", { optional: true }),
    meta: sheet.meta === undefined ? [] : WIDGETS.keyvalue({ items: sheet.meta }, "sheet.meta").items,
    panels,
  };
}
