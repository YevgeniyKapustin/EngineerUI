import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const TEXT_LIMIT = 2000;
const QUEUE_LIMIT = 100;
const DEFAULT_QUESTION = "Расскажи подробнее";

export class QuestionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function textOf(value, field, { required }) {
  const text = typeof value === "string" ? value.trim() : "";
  if (value !== undefined && typeof value !== "string") throw new QuestionError(400, `${field} — строка`);
  if (required && text === "") throw new QuestionError(400, `Нет поля ${field}`);
  if (text.length > TEXT_LIMIT) throw new QuestionError(400, `${field} длиннее ${TEXT_LIMIT} знаков`);
  return text;
}

export function questionOf(page, input, version) {
  return {
    id: randomUUID(),
    page,
    version: version ?? null,
    quote: textOf(input?.quote, "quote", { required: true }),
    question: textOf(input?.question, "question", { required: false }) || DEFAULT_QUESTION,
    context: textOf(input?.context, "context", { required: false }),
    at: Date.now(),
  };
}

export function createQuestions({ log, file }) {
  const queue = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  if (!Array.isArray(queue)) throw new Error("Очередь вопросов должна быть списком");
  for (const question of queue) {
    questionOf(question.page, question, question.version);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(question.page) || typeof question.id !== "string" || !Number.isFinite(question.at))
      throw new Error("В очереди повреждён вопрос");
  }
  const persist = () => {
    if (!file) return;
    writeFileSync(`${file}.tmp`, JSON.stringify(queue), "utf8");
    renameSync(`${file}.tmp`, file);
  };
  const listeners = new Set();
  const matches = (page, question) => page === undefined || question.page === page;

  function take(page) {
    const taken = queue.filter((question) => matches(page, question));
    for (const question of taken) queue.splice(queue.indexOf(question), 1);
    if (taken.length) persist();
    return taken;
  }

  return {
    put(question) {
      const { page } = question;
      if (queue.length >= QUEUE_LIMIT) throw new QuestionError(429, `В очереди уже ${QUEUE_LIMIT} вопросов: агент их не забирает`);
      queue.push(question);
      persist();
      const listening = [...listeners].filter((listener) => matches(listener.page, question)).length;
      log({ event: "question_queued", id: question.id, page, listening });
      [...listeners].find((listener) => matches(listener.page, question))?.wake();
      return { id: question.id, listening };
    },

    take(page, cancelled) {
      const ready = take(page);
      if (ready.length || cancelled === undefined) return Promise.resolve(ready);
      return new Promise((resolve) => {
        const listener = {
          page,
          wake: () => {
            listeners.delete(listener);
            resolve(take(page));
          },
        };
        listeners.add(listener);
        cancelled.then(() => {
          if (listeners.delete(listener)) resolve([]);
        });
      });
    },
  };
}
