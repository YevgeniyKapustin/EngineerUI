import { request as httpRequest } from "node:http";
import { parseArgs } from "node:util";
import { CliFailure, base, ensureServer, fail, runCli } from "./local-server.mjs";

// fetch обрывает запрос через 300 с без заголовков ответа, а сервер держит --wait до вопроса человека
function getAndWait(url) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on("error", (error) => reject(new CliFailure(`соединение с ${url} оборвалось: ${error.message}`)));
    request.end();
  });
}

await runCli("agent-ui-inbox", "inbox_failed", async () => {
  const { values } = parseArgs({ options: { id: { type: "string" }, wait: { type: "boolean", default: false } } });
  await ensureServer();
  const query = new URLSearchParams();
  if (values.id) query.set("id", values.id);
  if (values.wait) query.set("wait", "");
  const { status, body } = await getAndWait(`${base}/questions?${query}`);
  if (status !== 200) fail(`сервер отказал (${status}): ${body.error}`);
  process.stdout.write(`${JSON.stringify(body)}\n`);
});
