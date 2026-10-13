import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { WIDGETS, parseSheet } from "./sheet.mjs";
import { renderSheet } from "./sheet-page.mjs";

const ORIGIN = "http://127.0.0.1:1";
const sheetOf = (...widgets) => ({ title: "Лист", panels: [{ title: "Панель", widgets }] });
const render = (...widgets) => renderSheet(parseSheet(sheetOf(...widgets)), { origin: ORIGIN }).split("<body>")[1];
const refusal = (input) => {
  try {
    parseSheet(input);
  } catch (error) {
    assert.equal(error.status, 400);
    return error.message;
  }
  assert.fail("лист принят, а должен быть отклонён");
};

test("пример из examples/widgets.json проходит проверку и показывает все виджеты", () => {
  const example = JSON.parse(readFileSync(join(import.meta.dirname, "..", "examples", "widgets.json"), "utf8"));
  const kinds = new Set(parseSheet(example).panels.flatMap((panel) => panel.widgets.map((widget) => widget.kind)));
  assert.deepEqual([...kinds].sort(), Object.keys(WIDGETS).sort());
});

test("ошибка называет путь до поля", () => {
  assert.match(refusal(sheetOf({ kind: "pie" })), /^sheet\.panels\[0\]\.widgets\[0\]\.kind: неизвестный виджет, есть: text/);
  assert.match(
    refusal(sheetOf({ kind: "gauge", items: [{ label: "Фраза", value: 3, max: 0 }] })),
    /^sheet\.panels\[0\]\.widgets\[0\]\.items\[0\]\.max: нужно число больше нуля/,
  );
  assert.match(
    refusal(sheetOf({ kind: "table", columns: ["А", "Б"], rows: [["1"]] })),
    /^sheet\.panels\[0\]\.widgets\[0\]\.rows\[0\]: нужно 2 ячеек/,
  );
  assert.match(refusal(sheetOf({ kind: "callout", tone: "red", text: "x" })), /\.tone: «red» нет среди вариантов/);
  assert.match(refusal({ title: "Лист", panels: [] }), /^sheet\.panels: нужен непустой список/);
});

test("текст агента экранируется во всех полях", () => {
  const html = render(
    { kind: "text", text: "<script>alert(1)</script>" },
    { kind: "stats", items: [{ label: "<b>", value: "<i>", note: "\"><img src=x>" }] },
    { kind: "annotated", parts: [{ text: "<u>", note: "<s>" }] },
  );
  assert.doesNotMatch(html, /<script>alert|<b>|<i>|<u>|<s>|<img/);
  assert.match(html, /&#60;script&#62;/);
});

test("шкала выше предела красная, в пределе — нет", () => {
  const over = render({ kind: "gauge", items: [{ label: "Фраза", value: 29, limit: 25, max: 35 }] });
  const within = render({ kind: "gauge", items: [{ label: "Фраза", value: 14, limit: 20, max: 30 }] });
  assert.match(over, /class="gauge tone-bad"/);
  assert.doesNotMatch(within, /tone-bad/);
  assert.match(within, /<span style="left:50\.00%">15<\/span>/);
});

test("шаги и тона таблицы получают свой знак", () => {
  const html = render(
    { kind: "steps", items: [{ title: "Сборка", status: "done" }, { title: "Тесты", status: "failed" }] },
    { kind: "table", columns: ["Форма"], rows: [[{ text: "has closed", tone: "bad" }]] },
  );
  assert.match(html, /class="step-done"><span class="step-mark" aria-hidden="true">✓/);
  assert.match(html, /class="step-failed"><span class="step-mark" aria-hidden="true">✗/);
  assert.match(html, /<td class="tone-bad"><span class="mark" aria-hidden="true">✗<\/span>has closed<\/td>/);
});
