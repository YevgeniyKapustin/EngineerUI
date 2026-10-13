import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startServer } from "./server.mjs";

const SCREEN = {
  title: "Куда?",
  blocks: [{ kind: "choice", id: "target", label: "Ветка", options: ["release", "main"] }],
};

function call(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function openEvents(url) {
  const frames = [];
  let waiters = [];
  const req = request(`${url}/events`, (response) => {
    let buffer = "";
    response.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = /^data: (.*)$/m.exec(frame);
        if (/^event: asks$/m.test(frame)) frames.push(JSON.parse(data[1]));
        waiters = waiters.filter((waiter) => !waiter());
      }
    });
  });
  req.end();
  return {
    until: (check) =>
      new Promise((resolve) => {
        const waiter = () => {
          const found = frames.find(check);
          if (found) resolve(found);
          return Boolean(found);
        };
        if (!waiter()) waiters.push(waiter);
      }),
    close: () => req.destroy(),
  };
}

async function setup(t, options) {
  const logs = [];
  const artifactsDir = mkdtempSync(join(tmpdir(), "agent-ui-"));
  const server = await startServer({ log: (entry) => logs.push(entry), artifactsDir, ...options });
  t.after(async () => {
    await server.close();
    rmSync(artifactsDir, { recursive: true, force: true });
  });
  const page = await call(`${server.url}/`);
  const token = /data-token="([^"]+)"/.exec(page.text)[1];
  const json = { "content-type": "application/json" };
  const answer = (id, answers, headers = {}) =>
    call(`${server.url}/answer/${id}`, {
      method: "POST",
      headers: { ...json, origin: server.url, ...headers },
      body: { token, answers },
    });
  const ask = (body = SCREEN, headers = {}) =>
    call(`${server.url}/ask`, { method: "POST", headers: { ...json, ...headers }, body });
  const publish = (body, headers = {}) =>
    call(`${server.url}/artifacts`, { method: "POST", headers: { ...json, ...headers }, body });
  return { server, logs, token, answer, ask, page, publish };
}

function versions(url) {
  const seen = [];
  let wake = () => {};
  const req = request(url, (response) =>
    response.on("data", (chunk) => {
      for (const [, version] of String(chunk).matchAll(/event: version\ndata: (.+)\n/g)) seen.push(version);
      wake();
    }),
  );
  req.end();
  return {
    next: () => new Promise((resolve) => (wake = () => seen.length && resolve(seen.shift()))),
    close: () => req.destroy(),
  };
}

test("агент публикует страницу и получает ссылку, страница открывается в песочнице", async (t) => {
  const { server, publish, logs } = await setup(t);
  const html = "<!doctype html><title>Итог прогона</title><p>50 из 50</p>";
  const published = await publish({ html });
  assert.equal(published.status, 200);
  const { id, url, title } = JSON.parse(published.text);
  assert.equal(url, `${server.url}/a/${id}`);
  assert.equal(title, "Итог прогона");

  const shell = await call(url);
  assert.match(shell.text, new RegExp(`sandbox="[^"]*" src="/a/${id}/raw"`));
  assert.match(shell.text, /<title>Итог прогона<\/title>/);
  assert.doesNotMatch(shell.text, /allow-same-origin/);

  const raw = await call(`${url}/raw`);
  assert.ok(raw.text.startsWith(html));
  assert.match(raw.text, /agent-ui-explain/);
  assert.match(raw.headers["content-security-policy"], /^sandbox allow-scripts/);
  assert.doesNotMatch(raw.headers["content-security-policy"], /allow-same-origin/);

  const list = await call(`${server.url}/a`);
  assert.match(list.text, new RegExp(`data-artifact-id="${id}"`));
  assert.ok(logs.some((entry) => entry.event === "artifact_published" && entry.id === id));
});

test("повторная публикация с тем же id обновляет открытую страницу", async (t) => {
  const { server, publish } = await setup(t);
  await publish({ id: "plan", html: "<p>шаг 1</p>" });
  const stream = versions(`${server.url}/a/plan/events`);
  t.after(stream.close);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const update = stream.next();
  await publish({ id: "plan", html: "<p>шаг 2</p>" });
  assert.ok(Number(await update) > 0);
  assert.ok((await call(`${server.url}/a/plan/raw`)).text.startsWith("<p>шаг 2</p>"));
});

test("публикация из браузера, с плохим id и без html отклоняется", async (t) => {
  const { server, publish } = await setup(t);
  assert.equal((await publish({ html: "<p>x</p>" }, { origin: server.url })).status, 403);
  assert.equal((await publish({ id: "../evil", html: "<p>x</p>" })).status, 400);
  assert.equal((await publish({ id: "Big", html: "<p>x</p>" })).status, 400);
  assert.equal((await publish({ html: "  " })).status, 400);
  assert.equal((await call(`${server.url}/a/missing`)).status, 404);
  assert.equal((await call(`${server.url}/a/..%2Fx/raw`)).status, 400);
});

test("агент публикует лист виджетов, сервер рисует его и называет поле с ошибкой", async (t) => {
  const { server, publish } = await setup(t);
  const sheet = {
    title: "Прогон",
    panels: [{ title: "Тесты", widgets: [{ kind: "stats", items: [{ label: "Прошло", value: 50 }] }] }],
  };
  const published = await publish({ id: "run", sheet });
  assert.equal(published.status, 200);
  assert.equal(JSON.parse(published.text).title, "Прогон");
  const raw = await call(`${server.url}/a/run/raw`);
  assert.match(raw.text, /data-testid="widget-stat"/);
  assert.match(raw.text, new RegExp(`href="${server.url}/kit.css"`));

  const broken = { ...sheet, panels: [{ title: "Тесты", widgets: [{ kind: "pie" }] }] };
  const refused = await publish({ sheet: broken });
  assert.equal(refused.status, 400);
  assert.match(JSON.parse(refused.text).error, /^sheet\.panels\[0\]\.widgets\[0\]\.kind: неизвестный виджет/);
  assert.equal((await publish({ html: "<p>x</p>", sheet })).status, 400);
});

test("агент ждёт на /ask, человек отвечает со страницы, агент получает ответ", async (t) => {
  const { server, answer, ask, page } = await setup(t);
  assert.match(page.text, /Content-Security-Policy/);
  const events = openEvents(server.url);
  t.after(events.close);
  const reply = ask();
  const [opened] = await events.until((asks) => asks.length === 1);
  assert.equal(opened.screen.title, "Куда?");
  assert.equal((await answer(opened.id, { target: "dev" })).status, 400);
  assert.equal((await answer(opened.id, { target: "main" })).status, 200);
  const done = await reply;
  assert.deepEqual(JSON.parse(done.text), { status: "answered", answers: { target: "main" } });
  await events.until((asks) => asks.length === 0);
  assert.equal((await answer(opened.id, { target: "main" })).status, 409);
});

test("открытый лист показывает вопрос агента поверх себя, экран вопроса с полями ответа", async (t) => {
  const { server, publish } = await setup(t);
  const { url } = JSON.parse((await publish({ html: "<!doctype html><title>Отказ Docs</title><p>Итог</p>" })).text);
  const shell = (await call(url)).text;
  assert.match(shell, /new EventSource\("\/events"\)/);
  assert.match(shell, /addEventListener\("asks"/);
  assert.match(shell, /id: "ask-layer", src: "\/"/);
  assert.match(shell, /frame-src 'self'/);
  assert.doesNotMatch(shell, /id="ask-layer"[^>]*sandbox/);
  const asking = await call(`${server.url}/`);
  assert.equal(asking.headers["x-frame-options"], undefined);
  assert.match(asking.text, /new EventSource\("\/events"\)/);
  assert.match(asking.text, /element\(block\.multiline \? "textarea" : "input", "ask-field"\)/);
});

test("ответ с чужого сайта или с чужим ключом не принимается", async (t) => {
  const { server, answer, ask, token } = await setup(t);
  const events = openEvents(server.url);
  t.after(events.close);
  ask().catch(() => {});
  const [opened] = await events.until((asks) => asks.length === 1);
  assert.equal((await answer(opened.id, { target: "main" }, { origin: "http://evil.test" })).status, 403);
  const wrongToken = await call(`${server.url}/answer/${opened.id}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: server.url },
    body: { token: `${token}x`, answers: { target: "main" } },
  });
  assert.equal(wrongToken.status, 403);
});

test("/ask из браузера, с чужим Host и с плохим экраном отклоняется", async (t) => {
  const { server, ask } = await setup(t);
  assert.equal((await ask(SCREEN, { origin: server.url })).status, 403);
  assert.equal((await ask(SCREEN, { host: "evil.test" })).status, 403);
  const bad = await ask({ blocks: [{ kind: "video" }] });
  assert.equal(bad.status, 400);
  assert.match(JSON.parse(bad.text).error, /blocks\[0\]\.kind/);
});

test("без ответа агент получает timeout, и это видно в логе", async (t) => {
  const { ask, logs } = await setup(t, { timeoutMs: 20 });
  assert.deepEqual(JSON.parse((await ask()).text), { status: "timeout" });
  assert.ok(logs.some((entry) => entry.event === "ask_timeout"));
});

test("человек спрашивает о фрагменте листа, агент, который ждёт, получает вопрос", async (t) => {
  const { server, publish, token, logs } = await setup(t);
  await publish({ id: "plan", html: "<p>шаг 1</p>" });
  const ask = (body, headers = { origin: server.url }) =>
    call(`${server.url}/a/plan/questions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

  const waiting = call(`${server.url}/questions?id=plan&wait`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const queued = await ask({ token, quote: "шаг 1", context: "План" });
  assert.equal(queued.status, 200);
  assert.equal(JSON.parse(queued.text).listening, 1);

  const [question] = JSON.parse((await waiting).text).questions;
  assert.equal(question.page, "plan");
  assert.equal(question.quote, "шаг 1");
  assert.equal(question.question, "Расскажи подробнее");
  assert.equal(question.context, "План");
  assert.deepEqual(JSON.parse((await call(`${server.url}/questions`)).text).questions, []);
  assert.ok(logs.some((entry) => entry.event === "question_queued" && entry.listening === 1));
});

test("вопрос без ожидающего агента лежит в очереди до inbox", async (t) => {
  const { server, publish, token } = await setup(t);
  await publish({ id: "plan", html: "<p>шаг 1</p>" });
  const body = { token, quote: "шаг 1", question: "Почему так?" };
  const queued = await call(`${server.url}/a/plan/questions`, { method: "POST", headers: { "content-type": "application/json", origin: server.url }, body });
  assert.equal(JSON.parse(queued.text).listening, 0);
  assert.deepEqual(JSON.parse((await call(`${server.url}/questions?id=other`)).text).questions, []);
  const [question] = JSON.parse((await call(`${server.url}/questions?id=plan`)).text).questions;
  assert.equal(question.question, "Почему так?");
});

function answers(url) {
  let wake = () => {};
  const seen = [];
  const req = request(url, (response) =>
    response.on("data", (chunk) => {
      for (const [, data] of String(chunk).matchAll(/event: answer\ndata: (.+)\n/g)) seen.push(JSON.parse(data));
      wake();
    }),
  );
  req.end();
  return {
    next: () => new Promise((resolve) => (wake = () => seen.length && resolve(seen.shift()))),
    close: () => req.destroy(),
  };
}

const AGENT_PLACE = {
  worktree: "C:/work/tree",
  branch: "main",
  agent: { kind: "claude", session: "1ebe3f82-394b-4296-871c-cf7fabe6c559", command: "C:/bin/claude.exe" },
};

test("вопрос к листу сессии Claude уходит форку этой сессии, ответ приходит на страницу", async (t) => {
  const runs = [];
  const runFork = async (run) => {
    runs.push(run);
    return { text: "Потому что очередь живёт до перезапуска.", session: "fork-1", cost: 0.1 };
  };
  const { server, publish, token } = await setup(t, { runFork });
  await publish({ id: "plan", html: "<p>шаг 1</p>", place: AGENT_PLACE });
  const stream = answers(`${server.url}/a/plan/events`);
  t.after(stream.close);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const answer = stream.next();

  const body = { token, quote: "в памяти", question: "Почему?", context: "План" };
  const sent = await call(`${server.url}/a/plan/questions`, { method: "POST", headers: { "content-type": "application/json", origin: server.url }, body });
  const { status, id } = JSON.parse(sent.text);
  assert.equal(status, "forked");
  assert.deepEqual(await answer, { id, ok: true, text: "Потому что очередь живёт до перезапуска." });

  const [run] = runs;
  assert.equal(run.session, AGENT_PLACE.agent.session);
  assert.equal(run.command, AGENT_PLACE.agent.command);
  assert.equal(run.cwd, AGENT_PLACE.worktree);
  assert.match(run.prompt, /«в памяти»/);
  assert.match(run.prompt, /Вопрос: Почему\?/);
  assert.deepEqual(JSON.parse((await call(`${server.url}/questions`)).text).questions, []);
});

test("сбой форка приходит на страницу как отказ с причиной", async (t) => {
  const runFork = async () => {
    throw new Error("форк завершился с кодом 1");
  };
  const { server, publish, token } = await setup(t, { runFork });
  await publish({ id: "plan", html: "<p>шаг 1</p>", place: AGENT_PLACE });
  const stream = answers(`${server.url}/a/plan/events`);
  t.after(stream.close);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const answer = stream.next();
  await call(`${server.url}/a/plan/questions`, { method: "POST", headers: { "content-type": "application/json", origin: server.url }, body: { token, quote: "шаг 1" } });
  assert.deepEqual(await answer, { id: (await answer).id, ok: false, error: "форк завершился с кодом 1" });
});

test("публикация с чужой командой агента отклоняется", async (t) => {
  const { publish } = await setup(t);
  const place = { ...AGENT_PLACE, agent: { ...AGENT_PLACE.agent, command: "C:/Windows/System32/cmd.exe" } };
  assert.equal((await publish({ id: "plan", html: "<p>x</p>", place })).status, 400);
});

test("вопрос с чужого сайта, с чужим ключом или без фрагмента не принимается", async (t) => {
  const { server, publish, token } = await setup(t);
  await publish({ id: "plan", html: "<p>шаг 1</p>" });
  const ask = (body, origin = server.url) =>
    call(`${server.url}/a/plan/questions`, { method: "POST", headers: { "content-type": "application/json", origin }, body });
  assert.equal((await ask({ token, quote: "шаг 1" }, "http://evil.test")).status, 403);
  assert.equal((await ask({ token: "x", quote: "шаг 1" })).status, 403);
  assert.equal((await ask({ token, quote: " " })).status, 400);
  assert.equal((await call(`${server.url}/a/none/questions`, { method: "POST", headers: { "content-type": "application/json", origin: server.url }, body: { token, quote: "x" } })).status, 404);
  assert.equal((await call(`${server.url}/questions`, { headers: { origin: server.url } })).status, 403);
});
