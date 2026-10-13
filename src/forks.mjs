import { spawn } from "node:child_process";

const FORK_LIMIT = 3;
const FORK_TIMEOUT_MS = 5 * 60_000;
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];

export function promptOf({ page, quote, question, context }) {
  return [
    `Вопрос со страницы agent-ui «${page}»${context ? `, раздел «${context}»` : ""}.`,
    `Фрагмент:\n«${quote}»`,
    `Вопрос: ${question}`,
    "",
    "Это ответ в окне на странице, как /btw. Ответь простым текстом по-русски, до 150 слов.",
    "Не публикуй листы, не задавай вопросов человеку, не меняй файлы.",
  ].join("\n");
}

export function runClaude({ command, session, cwd, prompt, timeoutMs = FORK_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--resume", session, "--fork-session", "--output-format", "json", "--allowedTools", ...READ_ONLY_TOOLS];
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`форк не запустился: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error(`форк остановлен через ${timeoutMs / 1000} с`));
      try {
        const result = JSON.parse(Buffer.concat(out).toString("utf8"));
        if (result.is_error) return reject(new Error(String(result.result || result.subtype)));
        resolve({ text: String(result.result ?? "").trim(), session: result.session_id, cost: result.total_cost_usd });
      } catch {
        const reason = Buffer.concat(err).toString("utf8").trim().split("\n").pop();
        reject(new Error(`форк завершился с кодом ${code}${reason ? `: ${reason}` : ""}`));
      }
    });
    child.stdin.end(prompt);
  });
}

export function createForks({ log, run = runClaude, limit = FORK_LIMIT }) {
  let active = 0;
  return {
    canFork: (place) => place?.agent?.kind === "claude",
    busy: () => active >= limit,
    async ask(question, { agent, worktree }) {
      active += 1;
      log({ event: "fork_started", id: question.id, page: question.page, session: agent.session });
      try {
        const answer = await run({ command: agent.command, session: agent.session, cwd: worktree, prompt: promptOf(question) });
        log({ event: "fork_answered", id: question.id, fork: answer.session, cost: answer.cost });
        return { ok: true, text: answer.text };
      } catch (error) {
        log({ event: "fork_failed", id: question.id, reason: error.message });
        return { ok: false, error: error.message };
      } finally {
        active -= 1;
      }
    },
  };
}
