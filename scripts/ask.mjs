import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { parseArgs } from "node:util";
import { CliFailure, base, ensureServer, fail, readSource, runCli } from "./local-server.mjs";

const USAGE = "ask.mjs <screen.json | -> [--no-open]";

function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// fetch обрывает запрос через 300 с без заголовков ответа, а сервер держит /ask до ответа человека
function postAndWait(url, payload) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "POST", headers: { "content-type": "application/json" } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on("error", (error) => reject(new CliFailure(`соединение с ${url} оборвалось: ${error.message}`)));
    request.end(payload);
  });
}

await runCli("agent-ui-ask", "ask_failed", async () => {
  const { values, positionals } = parseArgs({
    options: { "no-open": { type: "boolean", default: false } },
    allowPositionals: true,
  });
  if (positionals.length !== 1) fail(`нужен ровно один экран. ${USAGE}`);
  const [source] = positionals;
  let screen;
  try {
    screen = JSON.parse(readSource(source));
  } catch (error) {
    if (error.name !== "SyntaxError") throw error;
    fail(`экран ${source} — не JSON: ${error.message}`);
  }

  const { viewers } = await ensureServer();
  if (viewers === 0 && !values["no-open"]) openBrowser(base);
  process.stderr.write(`вопрос открыт на ${base}, жду ответа человека\n`);
  const { status, body } = await postAndWait(`${base}/ask`, JSON.stringify(screen));
  if (status !== 200) fail(`сервер отказал (${status}): ${body.error}`);
  process.stdout.write(`${JSON.stringify(body)}\n`);
});
