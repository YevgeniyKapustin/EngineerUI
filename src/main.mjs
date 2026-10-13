import { homedir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.mjs";

const log = (entry) =>
  process.stderr.write(`${JSON.stringify({ component: "agent-ui", at: new Date().toISOString(), ...entry })}\n`);

const port = Number(process.env.AGENT_UI_PORT ?? 47700);
const timeoutMs = Number(process.env.AGENT_UI_TIMEOUT_MS ?? 10 * 60_000);
const artifactsDir = process.env.AGENT_UI_ARTIFACTS ?? join(homedir(), ".agent-ui", "artifacts");

const { url } = await startServer({ port, timeoutMs, artifactsDir, log });
process.stdout.write(
  `agent-ui слушает ${url}\nВопросы — ${url}/, страницы агента — ${url}/a, хранятся в ${artifactsDir}\n`,
);
