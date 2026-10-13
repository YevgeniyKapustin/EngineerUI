import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnswers, parseScreen } from "./screen.mjs";

const SCREEN = {
  blocks: [
    { kind: "text", text: "Ветка готова" },
    { kind: "choice", id: "target", label: "Куда", options: ["release", "main"] },
    { kind: "choice", id: "tags", label: "Метки", options: ["a", "b"], multi: true },
    { kind: "checklist", id: "after", items: ["снимок", "карточка"] },
    { kind: "input", id: "note", label: "Комментарий" },
  ],
};

test("экран получает заголовок и кнопку по умолчанию", () => {
  const screen = parseScreen(SCREEN);
  assert.equal(screen.title, "Агент спрашивает");
  assert.equal(screen.submit, "Ответить");
  assert.equal(screen.blocks.length, 5);
});

test("неизвестный блок, пустой список и повтор id называют место ошибки", () => {
  assert.throws(() => parseScreen({ blocks: [] }), /screen\.blocks/);
  assert.throws(() => parseScreen({ blocks: [{ kind: "video" }] }), /blocks\[0\]\.kind/);
  assert.throws(
    () =>
      parseScreen({
        blocks: [
          { kind: "input", id: "x", label: "a" },
          { kind: "input", id: "x", label: "b" },
        ],
      }),
    /blocks\[1\]\.id: id «x» уже занят/,
  );
  assert.throws(
    () => parseScreen({ blocks: [{ kind: "table", columns: ["a", "b"], rows: [["1"]] }] }),
    /rows\[0\]: нужно 2 ячеек/,
  );
});

test("ответ принимает только варианты экрана и отбрасывает чужие поля", () => {
  const screen = parseScreen(SCREEN);
  assert.deepEqual(
    parseAnswers(screen, {
      target: "main",
      tags: ["b", "b"],
      after: ["снимок"],
      note: "  ок  ",
      extra: "x",
    }),
    { answers: { target: "main", tags: ["b"], after: ["снимок"], note: "ок" } },
  );
  assert.throws(() => parseAnswers(screen, { target: "dev" }), /answers\.target/);
  assert.throws(() => parseAnswers(screen, { tags: "a" }), /answers\.tags: нужен список/);
});

test("уточнение к выбору и перечню приходит агенту рядом с ответом, даже без выбора", () => {
  const screen = parseScreen(SCREEN);
  assert.deepEqual(
    parseAnswers(screen, { target: "main" }, { target: "  после ревью ", tags: "свой: c", after: "   ", note: "x" }),
    { answers: { target: "main" }, notes: { target: "после ревью", tags: "свой: c" } },
  );
  assert.throws(() => parseAnswers(screen, {}, { target: 1 }), /notes\.target: нужна строка/);
});
