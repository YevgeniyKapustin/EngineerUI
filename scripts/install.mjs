import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const BEGIN = "<!-- agent-ui:begin -->";
const END = "<!-- agent-ui:end -->";
const ROOT = resolve(import.meta.dirname, "..").replaceAll("\\", "/");
const HOME = process.env.AGENT_UI_HOME ?? homedir();

// omp читает ~/.codex/AGENTS.md как пользовательские правила, поэтому один файл покрывает Codex и omp
const TARGETS = [
  { name: "Claude Code", rules: join(HOME, ".claude", "CLAUDE.md") },
  { name: "Codex и omp", rules: join(HOME, ".codex", "AGENTS.md") },
];

function ruleBlock() {
  const source = readFileSync(join(ROOT, "docs", "agent-instructions.md"), "utf8");
  return source.trim().replaceAll("{{ROOT}}", ROOT);
}

function blockRange(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  return start >= 0 && end > start ? [start, end + END.length] : null;
}

function readOr(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function install(target) {
  mkdirSync(dirname(target.rules), { recursive: true });
  const current = readOr(target.rules);
  const range = blockRange(current);
  const block = ruleBlock();
  const next = range
    ? `${current.slice(0, range[0])}${block}${current.slice(range[1])}`
    : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;
  writeFileSync(target.rules, next, "utf8");
  return `правила ${range ? "обновлены" : "добавлены"} в ${target.rules}`;
}

function uninstall(target) {
  const current = readOr(target.rules);
  const range = blockRange(current);
  if (!range) return `блок не найден в ${target.rules}`;
  const before = current.slice(0, range[0]).trimEnd();
  const after = current.slice(range[1]).trimStart();
  writeFileSync(target.rules, [before, after].filter(Boolean).join("\n\n") + (before || after ? "\n" : ""), "utf8");
  return `блок убран из ${target.rules}`;
}

function status(target) {
  return blockRange(readOr(target.rules)) ? `блок есть в ${target.rules}` : `блока нет в ${target.rules}`;
}

const ACTIONS = { install, uninstall, status };
const action = ACTIONS[process.argv[2]];
if (!action) {
  process.stderr.write("Использование: node scripts/install.mjs install | uninstall | status\n");
  process.exit(2);
}
for (const target of TARGETS) process.stdout.write(`${target.name}: ${action(target)}\n`);
