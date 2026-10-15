import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createQuestions, questionOf } from "./questions.mjs";

test("непрочитанный вопрос переживает перезапуск и не возвращается после получения", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agent-ui-questions-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const options = { file: join(dir, "queue.json"), log: () => {} };
  const question = questionOf("report", { quote: "Факт", question: "Где источник?" });
  createQuestions(options).put(question);
  assert.deepEqual(await createQuestions(options).take("report"), [question]);
  assert.deepEqual(await createQuestions(options).take("report"), []);
});
