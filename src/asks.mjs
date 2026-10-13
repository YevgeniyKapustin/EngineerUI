import { randomUUID } from "node:crypto";
import { parseAnswers } from "./screen.mjs";

export class AskError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createAsks({ timeoutMs, log, onChange }) {
  const open = new Map();

  function close(id, outcome) {
    const ask = open.get(id);
    if (!ask) return false;
    clearTimeout(ask.timer);
    open.delete(id);
    ask.resolve(outcome);
    onChange();
    return true;
  }

  return {
    list: () => [...open.values()].map(({ id, screen, at }) => ({ id, screen, at })),

    about(id) {
      const ask = open.get(id);
      if (!ask) throw new AskError(409, "Вопрос уже закрыт: агент получил ответ или перестал ждать");
      return { screen: ask.screen, place: ask.place };
    },

    returnQuestion(id, { quote, question, context }) {
      if (!close(id, { status: "question", quote, question, context }))
        throw new AskError(409, "Вопрос уже закрыт: агент получил ответ или перестал ждать");
      log({ event: "ask_questioned", id });
    },

    ask(screen, cancelled, place) {
      const id = randomUUID();
      const reply = new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (close(id, { status: "timeout" })) log({ event: "ask_timeout", id });
        }, timeoutMs);
        open.set(id, { id, screen, place, at: Date.now(), resolve, timer });
      });
      cancelled.then(() => {
        if (close(id, { status: "cancelled" })) log({ event: "ask_cancelled", id });
      });
      log({ event: "ask_opened", id, blocks: screen.blocks.length });
      onChange();
      return reply;
    },

    answer(id, input, notes) {
      const ask = open.get(id);
      if (!ask) throw new AskError(409, "Вопрос уже закрыт: агент получил ответ или перестал ждать");
      const reply = parseAnswers(ask.screen, input, notes);
      close(id, { status: "answered", ...reply });
      log({ event: "ask_answered", id, fields: Object.keys(reply.answers).length, notes: Object.keys(reply.notes ?? {}).length });
    },
  };
}
