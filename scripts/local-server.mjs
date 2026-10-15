import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const START_WAIT_MS = 5_000;

const port = Number(process.env.AGENT_UI_PORT ?? 47700);
const home = join(homedir(), ".agent-ui");
export const base = `http://127.0.0.1:${port}`;

export class CliFailure extends Error {}

export function fail(reason) {
  throw new CliFailure(reason);
}

export async function health() {
  try {
    const response = await fetch(`${base}/health`);
    const body = response.ok ? await response.json() : {};
    return body.app === "agent-ui" ? body : undefined;
  } catch {
    return undefined;
  }
}

export async function ensureServer() {
  const running = await health();
  if (running) return running;
  mkdirSync(home, { recursive: true });
  const logFile = openSync(join(home, "server.log"), "a");
  spawn(process.execPath, [join(import.meta.dirname, "..", "src", "main.mjs")], {
    detached: true,
    stdio: ["ignore", logFile, logFile],
    windowsHide: true,
    env: { ...process.env, AGENT_UI_PORT: String(port) },
  }).unref();
  const deadline = Date.now() + START_WAIT_MS;
  while (Date.now() < deadline) {
    const started = await health();
    if (started) return started;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  fail(`сервер agent-ui не поднялся на ${base} за ${START_WAIT_MS} мс, лог — ${join(home, "server.log")}`);
}

export function readSource(source) {
  try {
    return source === "-" ? readFileSync(process.stdin.fd, "utf8") : readFileSync(source, "utf8");
  } catch (error) {
    fail(`не прочитан ${source}: ${error.message}`);
  }
}

export async function runCli(component, event, main) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof CliFailure)) throw error;
    process.stderr.write(`${JSON.stringify({ component, event, reason: error.message })}\n`);
    process.exitCode = 1;
  }
}

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function placeOf() {
  const worktree = git("rev-parse", "--show-toplevel");
  return { worktree: worktree || process.cwd().replaceAll("\\", "/"), branch: worktree ? git("branch", "--show-current") : "", ...agentOf() };
}

function agentOf() {
  const { CLAUDE_CODE_SESSION_ID: session, CLAUDE_CODE_EXECPATH: command } = process.env;
  return session && command ? { agent: { kind: "claude", session, command } } : {};
}
