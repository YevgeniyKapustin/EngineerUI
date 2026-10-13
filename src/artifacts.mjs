import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HISTORY_DIR = "history";
const HISTORY_LIMIT = 20;
const KINDS = { html: ".html", sheet: ".sheet.json" };

export class ArtifactError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PLACE_LIMIT = 400;

function placeOf(given) {
  if (given === undefined || given === null) return undefined;
  const fields = given && typeof given === "object" ? [given.worktree, given.branch ?? ""] : [];
  if (fields.length !== 2 || fields.some((field) => typeof field !== "string" || field.length > PLACE_LIMIT))
    throw new ArtifactError(400, "place — объект {worktree, branch} из строк до 400 знаков");
  return { worktree: given.worktree, branch: given.branch ?? "" };
}

function readPlace(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function titleOf({ kind, text }) {
  if (kind === "sheet") return JSON.parse(text).title ?? "";
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(text);
  return match ? match[1].trim() : "";
}

function readKinded(base, missing) {
  for (const [kind, extension] of Object.entries(KINDS)) {
    try {
      return { kind, text: readFileSync(`${base}${extension}`, "utf8"), path: `${base}${extension}` };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new ArtifactError(404, missing);
}

function kindOfName(name) {
  return Object.entries(KINDS).find(([, extension]) => name.endsWith(extension));
}

export function createArtifacts({ dir, onChange = () => {} }) {
  mkdirSync(dir, { recursive: true });
  const baseOf = (id) => join(dir, id);
  const placeFileOf = (id) => join(dir, `${id}.json`);
  const historyOf = (id) => join(dir, HISTORY_DIR, id);

  function checkId(id) {
    if (typeof id !== "string" || !ID_PATTERN.test(id))
      throw new ArtifactError(400, "id — латиница в нижнем регистре, цифры и дефис, до 64 знаков");
  }

  function versionsOf(id) {
    try {
      return readdirSync(historyOf(id))
        .filter((name) => /^[0-9]+\.(html|sheet\.json)$/.test(name))
        .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  function currentOf(id) {
    checkId(id);
    return readKinded(baseOf(id), "Нет такой страницы");
  }

  function keepPrevious(id) {
    let previous;
    try {
      previous = currentOf(id);
    } catch (error) {
      if (error.status === 404) return;
      throw error;
    }
    const stat = statSync(previous.path);
    mkdirSync(historyOf(id), { recursive: true });
    const [latest] = versionsOf(id);
    const next = latest ? Number.parseInt(latest, 10) + 1 : 1;
    const copy = join(historyOf(id), `${next}${KINDS[previous.kind]}`);
    copyFileSync(previous.path, copy);
    const place = readPlace(placeFileOf(id));
    if (place) writeFileSync(join(historyOf(id), `${next}.json`), JSON.stringify(place), "utf8");
    utimesSync(copy, stat.atime, stat.mtime);
    for (const stale of versionsOf(id).slice(HISTORY_LIMIT)) {
      rmSync(join(historyOf(id), stale));
      rmSync(join(historyOf(id), `${Number.parseInt(stale, 10)}.json`), { force: true });
    }
  }

  return {
    save({ id, html, sheet, place: given }) {
      if ((html === undefined) === (sheet === undefined)) throw new ArtifactError(400, "Нужно ровно одно из полей: html или sheet");
      if (html !== undefined && (typeof html !== "string" || html.trim() === "")) throw new ArtifactError(400, "Нет поля html");
      const kind = html === undefined ? "sheet" : "html";
      const text = kind === "html" ? html : JSON.stringify(sheet);
      const key = id ?? randomBytes(5).toString("hex");
      checkId(key);
      const place = placeOf(given);
      keepPrevious(key);
      const target = `${baseOf(key)}${KINDS[kind]}`;
      const draft = `${target}.${process.pid}.tmp`;
      writeFileSync(draft, text, "utf8");
      renameSync(draft, target);
      for (const [other, extension] of Object.entries(KINDS)) if (other !== kind) rmSync(`${baseOf(key)}${extension}`, { force: true });
      if (place) writeFileSync(placeFileOf(key), JSON.stringify(place), "utf8");
      else rmSync(placeFileOf(key), { force: true });
      const version = statSync(target).mtimeMs;
      onChange(key, version);
      return { id: key, version, title: titleOf({ kind, text }), bytes: Buffer.byteLength(text) };
    },

    read(id) {
      const { kind, text } = currentOf(id);
      return { kind, text };
    },

    describe(id) {
      const current = currentOf(id);
      return { id, title: titleOf(current), at: statSync(current.path).mtimeMs, place: readPlace(placeFileOf(id)) };
    },

    history(id) {
      currentOf(id);
      return versionsOf(id).map((name) => {
        const path = join(historyOf(id), name);
        const version = Number.parseInt(name, 10);
        return {
          version,
          title: titleOf({ kind: kindOfName(name)[0], text: readFileSync(path, "utf8") }),
          at: statSync(path).mtimeMs,
          place: readPlace(join(historyOf(id), `${version}.json`)),
        };
      });
    },

    readVersion(id, version) {
      checkId(id);
      if (!/^[0-9]{1,16}$/.test(version)) throw new ArtifactError(400, "Версия — число");
      const { kind, text } = readKinded(join(historyOf(id), version), "Нет такой версии");
      return { kind, text };
    },

    list() {
      return readdirSync(dir)
        .map((name) => [name, kindOfName(name)])
        .filter(([name, found]) => found && !name.endsWith(".tmp"))
        .map(([name, [kind, extension]]) => {
          const id = name.slice(0, -extension.length);
          const path = join(dir, name);
          return { id, title: titleOf({ kind, text: readFileSync(path, "utf8") }), at: statSync(path).mtimeMs, place: readPlace(placeFileOf(id)) };
        })
        .sort((a, b) => b.at - a.at);
    },
  };
}
