import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { FRAME_SANDBOX, historyOf, listOf, shellOf } from "./artifact-page.mjs";
import { FAVICON } from "./favicon.mjs";
import { createArtifacts } from "./artifacts.mjs";
import { createAsks } from "./asks.mjs";
import { kitCss, pageOf } from "./page.mjs";
import { parseScreen } from "./screen.mjs";
import { parseSheet } from "./sheet.mjs";
import { checkHtmlSte, steChecked, storedText } from "./ste.mjs";
import { renderSheet, sheetCss } from "./sheet-page.mjs";

const BODY_LIMIT = 1024 * 1024;
const ARTIFACT_LIMIT = 8 * 1024 * 1024;
const PING_MS = 20_000;
const HTML = "text/html; charset=utf-8";
const INDEX = {
  "content-security-policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src data:; base-uri 'none'; form-action 'none'",
};
const SANDBOXED = { "content-security-policy": `sandbox ${FRAME_SANDBOX}`, "x-content-type-options": "nosniff" };

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(request, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/.test(request.headers["content-type"] ?? ""))
      return reject(new RequestError(415, "Нужен content-type: application/json"));
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new RequestError(413, `Тело запроса больше ${limit / 1024 / 1024} МБ`));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new RequestError(400, "Тело запроса — не JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(response, status, body, type = "application/json; charset=utf-8", headers = {}) {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function openStream(request, response, listeners, first) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  response.write(`retry: 2000\n\n${first}`);
  const ping = setInterval(() => response.write(": ping\n\n"), PING_MS);
  listeners.add(response);
  request.on("close", () => {
    clearInterval(ping);
    listeners.delete(response);
  });
}

function patternOf(path) {
  const match = /^\/(answer|a)\/([^/]+)(\/raw|\/events|\/history|\/download)?(?:\/([^/]+))?$/.exec(path);
  if (!match) return [path];
  const [, kind, id, tail = "", version] = match;
  if (version === undefined) return [`/${kind}/:id${tail}`, id];
  return tail === "/history" ? [`/${kind}/:id/history/:version`, id, version] : [path];
}

export function startServer({ port = 0, timeoutMs = 10 * 60_000, artifactsDir, log = () => {} }) {
  const token = randomBytes(24).toString("base64url");
  const viewers = new Set();
  const watchers = new Map();
  let origin = "";

  const watchersOf = (id) => {
    if (!watchers.has(id)) watchers.set(id, new Set());
    return watchers.get(id);
  };
  const artifacts = createArtifacts({
    dir: artifactsDir,
    onChange: (id, version) => {
      for (const watcher of watchersOf(id)) watcher.write(`event: version\ndata: ${version}\n\n`);
    },
  });

  const broadcast = () => {
    const frame = `event: asks\ndata: ${JSON.stringify(asks.list())}\n\n`;
    for (const viewer of viewers) viewer.write(frame);
  };
  const asks = createAsks({ timeoutMs, log, onChange: broadcast });

  function checkHost(request) {
    if (request.headers.host !== new URL(origin).host)
      throw new RequestError(403, "Чужой Host: сервер отвечает только на свой адрес");
  }

  function fromAgent(request) {
    if (request.headers.origin || request.headers["sec-fetch-site"])
      throw new RequestError(403, "Агентский адрес не принимает запросы из браузера");
  }

  function fromPage(request) {
    if (request.headers.origin !== origin)
      throw new RequestError(403, "Ответ принимается только со страницы agent-ui");
  }

  function worktreeHistoryOf(id, place) {
    const pages = place ? artifacts.list().filter((page) => page.place?.worktree === place.worktree) : [artifacts.describe(id)];
    return pages
      .flatMap((page) => [
        { id: page.id, version: null, title: page.title, at: page.at, branch: page.place?.branch ?? "" },
        ...artifacts
          .history(page.id)
          .filter((entry) => page.id === id || entry.place?.worktree === place.worktree)
          .map((entry) => ({ id: page.id, version: entry.version, title: entry.title, at: entry.at, branch: entry.place?.branch ?? "" })),
      ])
      .sort((a, b) => b.at - a.at);
  }

  const pageHtml = ({ kind, text }) =>
    kind === "sheet" ? renderSheet(storedText(() => parseSheet(JSON.parse(text))), { origin, history: true }) : text;

  const routes = {
    "GET /": (request, response) => send(response, 200, pageOf({ token }), HTML),

    "GET /events": (request, response) => {
      openStream(request, response, viewers, `event: asks\ndata: ${JSON.stringify(asks.list())}\n\n`);
      log({ event: "viewer_open", viewers: viewers.size });
      request.on("close", () => log({ event: "viewer_closed", viewers: viewers.size }));
    },

    "GET /health": (request, response) => send(response, 200, { app: "agent-ui", viewers: viewers.size }),

    "GET /favicon.svg": (request, response) =>
      send(response, 200, FAVICON, "image/svg+xml", { "cache-control": "max-age=86400" }),

    "GET /favicon.ico": (request, response) =>
      send(response, 200, FAVICON, "image/svg+xml", { "cache-control": "max-age=86400" }),

    "GET /sheet.css": (request, response) =>
      send(response, 200, sheetCss(), "text/css; charset=utf-8", { "access-control-allow-origin": "*" }),

    "GET /kit.css": (request, response) =>
      send(response, 200, kitCss(), "text/css; charset=utf-8", { "access-control-allow-origin": "*" }),

    "POST /ask": async (request, response) => {
      fromAgent(request);
      const input = await readJson(request);
      const screen = steChecked(() => parseScreen(input));
      const cancelled = new Promise((resolve) => response.on("close", resolve));
      if (viewers.size === 0) log({ event: "ask_no_viewer" });
      const outcome = await asks.ask(screen, cancelled);
      if (!response.writableEnded && !response.destroyed) send(response, 200, outcome);
    },

    "POST /answer/:id": async (request, response, id) => {
      fromPage(request);
      const body = await readJson(request);
      if (!sameToken(body.token, token)) throw new RequestError(403, "Неверный ключ страницы");
      asks.answer(id, body.answers);
      send(response, 200, { status: "answered" });
    },

    "POST /artifacts": async (request, response) => {
      fromAgent(request);
      const body = await readJson(request, ARTIFACT_LIMIT);
      if ((body.html === undefined) === (body.sheet === undefined))
        throw new RequestError(400, "Нужно ровно одно из полей: html или sheet");
      if (body.sheet !== undefined) steChecked(() => parseSheet(body.sheet));
      else if (typeof body.html === "string") checkHtmlSte(body.html, "html");
      const saved = artifacts.save({ id: body.id, html: body.html, sheet: body.sheet, place: body.place });
      log({ event: "artifact_published", id: saved.id, bytes: saved.bytes });
      send(response, 200, { ...saved, url: `${origin}/a/${saved.id}` });
    },

    "GET /a": (request, response) => send(response, 200, listOf(artifacts.list(), { origin }), HTML, INDEX),

    "GET /a/:id": (request, response, id) => send(response, 200, shellOf(artifacts.describe(id)), HTML),

    "GET /a/:id/raw": (request, response, id) => send(response, 200, pageHtml(artifacts.read(id)), HTML, SANDBOXED),

    "GET /a/:id/download": (request, response, id) => {
      const version = new URL(request.url, origin).searchParams.get("version");
      const stored = version ? artifacts.readVersion(id, version) : artifacts.read(id);
      const html =
        stored.kind === "sheet"
          ? renderSheet(storedText(() => parseSheet(JSON.parse(stored.text))), { origin, kit: kitCss() })
          : stored.text.replace(/<link rel="stylesheet" href="[^"]*\/kit\.css">/, () => `<style>${kitCss()}</style>`);
      send(response, 200, html, HTML, { ...SANDBOXED, "content-disposition": `attachment; filename="${id}.html"` });
    },

    "GET /a/:id/history": (request, response, id) => {
      const current = artifacts.describe(id);
      const { place } = current;
      const versions = artifacts.history(id);
      if (request.headers.accept?.includes("application/json"))
        return send(response, 200, { place, entries: worktreeHistoryOf(id, place) });
      send(response, 200, historyOf({ ...current, versions }, { origin }), HTML, INDEX);
    },

    "GET /a/:id/history/:version": (request, response, id, version) =>
      send(response, 200, pageHtml(artifacts.readVersion(id, version)), HTML, SANDBOXED),

    "GET /a/:id/events": (request, response, id) => {
      artifacts.describe(id);
      openStream(request, response, watchersOf(id), "");
    },
  };

  async function handle(request, response) {
    try {
      checkHost(request);
      const [pattern, ...params] = patternOf(request.url.split("?")[0]);
      const route = routes[`${request.method} ${pattern}`];
      if (!route) throw new RequestError(404, "Нет такого адреса");
      await route(request, response, ...params);
    } catch (error) {
      if (!error.status) log({ event: "request_failed", reason: error.message });
      else log({ event: "request_refused", status: error.status, reason: error.message });
      if (!response.headersSent) send(response, error.status ?? 500, { error: error.message });
    }
  }

  const server = createServer(handle);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      log({ event: "server_started", url: origin });
      resolve({
        url: origin,
        close: () =>
          new Promise((done) => {
            for (const viewer of viewers) viewer.end();
            for (const group of watchers.values()) for (const watcher of group) watcher.end();
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}
