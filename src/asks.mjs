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

    ask(screen, cancelled) {
      const id = randomUUID();
      const reply = new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (close(id, { status: "timeout" })) log({ event: "ask_timeout", id });
        }, timeoutMs);
        open.set(id, { id, screen, at: Date.now(), resolve, timer });
      });
      cancelled.then(() => {
        if (close(id, { status: "cancelled" })) log({ event: "ask_cancelled", id });
      });
      log({ event: "ask_opened", id, blocks: screen.blocks.length });
      onChange();
      return reply;
    },

    answer(id, input) {
      const ask = open.get(id);
      if (!ask) throw new AskError(409, "Вопрос уже закрыт: агент получил ответ или перестал ждать");
      const answers = parseAnswers(ask.screen, input);
      close(id, { status: "answered", answers });
      log({ event: "ask_answered", id, fields: Object.keys(answers).length });
    },
  };
}
