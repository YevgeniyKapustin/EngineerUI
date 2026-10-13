import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { noteSheetOf } from "../src/note.mjs";
import { base, ensureServer, fail, readSource, runCli } from "./local-server.mjs";

const USAGE = "publish.mjs <page.html | sheet.json | note.txt | -> [--id slug] [--tone good|bad|warn|info]";

function payloadOf(source, content, tone) {
  const start = content.trimStart();
  if (source.endsWith(".txt") || (!source.endsWith(".json") && !start.startsWith("{") && !start.startsWith("<")))
    return { sheet: noteSheetOf(content, tone) };
  if (!source.endsWith(".json") && !start.startsWith("{")) return { html: content };
  try {
    return { sheet: JSON.parse(content) };
  } catch (error) {
    fail(`лист ${source} — не JSON: ${error.message}`);
  }
}

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function placeOf() {
  const worktree = git("rev-parse", "--show-toplevel");
  return worktree ? { worktree, branch: git("branch", "--show-current") } : undefined;
}

await runCli("agent-ui-publish", "publish_failed", async () => {
  const { values, positionals } = parseArgs({
    options: { id: { type: "string" }, tone: { type: "string" } },
    allowPositionals: true,
  });
  if (positionals.length !== 1) fail(`нужен ровно один файл. ${USAGE}`);
  const [source] = positionals;
  const content = readSource(source);

  await ensureServer();
  const response = await fetch(`${base}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: values.id, place: placeOf(), ...payloadOf(source, content, values.tone) }),
  });
  const body = await response.json();
  if (!response.ok) fail(`сервер отказал (${response.status}): ${body.error}`);
  process.stdout.write(`${body.url}\n`);
});
