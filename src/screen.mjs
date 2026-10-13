import { TEXT_LIMIT, fail, oneOf, text, texts } from "./fields.mjs";
import { prose, proses } from "./ste.mjs";

const ID = /^[a-z][a-z0-9_-]{0,63}$/;

const BLOCKS = {
  text: (block, where) => ({ kind: "text", text: prose(block.text, `${where}.text`) }),
  choice: (block, where) => ({
    kind: "choice",
    id: block.id,
    label: prose(block.label, `${where}.label`),
    options: proses(block.options, `${where}.options`),
    multi: block.multi === true,
  }),
  input: (block, where) => ({
    kind: "input",
    id: block.id,
    label: prose(block.label, `${where}.label`),
    placeholder: text(block.placeholder, `${where}.placeholder`, { optional: true }),
    multiline: block.multiline === true,
  }),
  checklist: (block, where) => ({
    kind: "checklist",
    id: block.id,
    label: prose(block.label, `${where}.label`, { optional: true }),
    items: proses(block.items, `${where}.items`),
  }),
  table: (block, where) => {
    const columns = texts(block.columns, `${where}.columns`);
    if (!Array.isArray(block.rows)) fail(`${where}.rows`, "нужен список строк таблицы");
    const rows = block.rows.map((row, index) => {
      if (!Array.isArray(row) || row.length !== columns.length)
        fail(`${where}.rows[${index}]`, `нужно ${columns.length} ячеек`);
      return row.map((cell) => String(cell));
    });
    return { kind: "table", columns, rows };
  },
};

const ASKING = new Set(["choice", "input", "checklist"]);

export function parseScreen(input) {
  if (!input || typeof input !== "object") fail("screen", "нужен объект");
  if (!Array.isArray(input.blocks) || input.blocks.length === 0)
    fail("screen.blocks", "нужен непустой список блоков");
  const ids = new Set();
  const blocks = input.blocks.map((block, index) => {
    const where = `blocks[${index}]`;
    const build = BLOCKS[block?.kind];
    if (!build) fail(`${where}.kind`, `неизвестный блок, есть: ${Object.keys(BLOCKS).join(", ")}`);
    if (ASKING.has(block.kind)) {
      if (typeof block.id !== "string" || !ID.test(block.id))
        fail(`${where}.id`, "нужен id из латиницы, цифр, _ и -");
      if (ids.has(block.id)) fail(`${where}.id`, `id «${block.id}» уже занят`);
      ids.add(block.id);
    }
    return build(block, where);
  });
  return {
    title: prose(input.title, "screen.title", { optional: true }) ?? "Агент спрашивает",
    submit: text(input.submit, "screen.submit", { optional: true }) ?? "Ответить",
    blocks,
  };
}

function listOf(value, allowed, where) {
  if (!Array.isArray(value)) fail(where, "нужен список");
  return [...new Set(value.map((item) => oneOf(item, allowed, where)))];
}

const ANSWERS = {
  choice: (block, value, where) =>
    block.multi ? listOf(value, block.options, where) : oneOf(value, block.options, where),
  input: (block, value, where) => {
    if (typeof value !== "string") fail(where, "нужна строка");
    return value.trim().slice(0, TEXT_LIMIT);
  },
  checklist: (block, value, where) => listOf(value, block.items, where),
};

const NOTED = new Set(["choice", "checklist"]);

export function parseAnswers(screen, input, notesInput = {}) {
  if (!input || typeof input !== "object") fail("answers", "нужен объект");
  if (!notesInput || typeof notesInput !== "object") fail("notes", "нужен объект");
  const answers = {};
  const notes = {};
  for (const block of screen.blocks) {
    if (!ASKING.has(block.kind)) continue;
    const value = input[block.id];
    if (value !== undefined && value !== null)
      answers[block.id] = ANSWERS[block.kind](block, value, `answers.${block.id}`);
    const note = notesInput[block.id];
    if (!NOTED.has(block.kind) || note === undefined || note === null) continue;
    const trimmed = ANSWERS.input(block, note, `notes.${block.id}`);
    if (trimmed) notes[block.id] = trimmed;
  }
  return Object.keys(notes).length ? { answers, notes } : { answers };
}
