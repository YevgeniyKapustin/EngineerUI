const screensBox = document.getElementById("screens");
const idle = document.getElementById("idle");
const link = document.getElementById("link");
const token = document.body.dataset.token;
const drafts = new Map();
const NOTE_KEY = Symbol("notes");
let answered = false;

function paintIdle() {
  idle.dataset.sent = answered ? "on" : "off";
  document.getElementById("idle-title").textContent = answered ? "Ответ у агента" : "Вопросов нет";
  document.getElementById("idle-text").textContent = answered
    ? "Агент получил ответ и работает. Новый вопрос появится здесь сам."
    : "Агент пока ничего не спрашивает. Новый вопрос появится здесь сам.";
  document.getElementById("idle-state").textContent = answered ? "обрабатывает" : "ждёт";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function noteField(block, draft) {
  const notes = (draft[NOTE_KEY] ??= {});
  const control = element("textarea", "ask-field ask-note");
  control.dataset.testid = "choice-note";
  control.dataset.field = block.id;
  control.rows = 2;
  control.placeholder = "Свой вариант или уточнение — агент получит текст вместе с выбором";
  control.setAttribute("aria-label", `${block.label || "Перечень"}: свой вариант или уточнение`);
  control.value = notes[block.id] ?? "";
  control.addEventListener("input", () => (notes[block.id] = control.value));
  return control;
}

function withNote(body, block, draft) {
  const box = element("div", "ask-noted");
  box.append(body, noteField(block, draft));
  return box;
}

function option(label, index, multi, draft, id) {
  const node = element("button", "ask-option");
  node.type = "button";
  node.dataset.testid = "choice-option";
  node.dataset.option = label;
  node.dataset.multi = multi ? "on" : "off";
  node.style.setProperty("--i", index);
  const selected = () => (multi ? draft[id]?.includes(label) : draft[id] === label);
  const paint = () => {
    node.dataset.selected = selected() ? "on" : "off";
    node.setAttribute("aria-pressed", String(selected()));
  };
  node.append(
    element("span", "ask-option-index", String(index + 1).padStart(2, "0")),
    element("span", "ask-option-label", label),
    element("span", "ask-option-mark"),
  );
  node.addEventListener("click", () => {
    if (multi) {
      const picked = new Set(draft[id] ?? []);
      if (picked.has(label)) picked.delete(label);
      else picked.add(label);
      draft[id] = [...picked];
    } else draft[id] = selected() ? undefined : label;
    for (const sibling of node.parentElement.children) sibling.paint();
  });
  node.paint = paint;
  paint();
  return node;
}

const BLOCKS = {
  text: (block) => ({ title: "Пояснение", body: element("p", "ask-text", block.text) }),

  choice: (block, draft) => {
    const options = element("div", "ask-options");
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", block.label);
    options.append(...block.options.map((label, index) => option(label, index, block.multi, draft, block.id)));
    return {
      title: block.label,
      caption: block.multi ? "несколько вариантов или свой" : "один вариант или свой",
      body: withNote(options, block, draft),
    };
  },

  input: (block, draft) => {
    const control = element(block.multiline ? "textarea" : "input", "ask-field");
    control.dataset.testid = "input-field";
    control.dataset.field = block.id;
    control.setAttribute("aria-label", block.label);
    if (block.placeholder) control.placeholder = block.placeholder;
    if (block.multiline) control.rows = 4;
    control.value = draft[block.id] ?? "";
    control.addEventListener("input", () => (draft[block.id] = control.value));
    // Enter в единственной строке формы отправляет форму целиком; отправка — только кнопкой или Ctrl+Enter
    if (!block.multiline)
      control.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) event.preventDefault();
      });
    return { title: block.label, caption: block.multiline ? "текст" : "строка", body: control };
  },

  checklist: (block, draft) => {
    const box = element("div", "ask-checks");
    block.items.forEach((item, index) => {
      const row = element("label", "ask-check");
      row.style.setProperty("--i", index);
      const check = element("input");
      check.type = "checkbox";
      check.dataset.testid = "checklist-item";
      check.checked = draft[block.id]?.includes(item) ?? false;
      check.addEventListener("change", () => {
        const picked = new Set(draft[block.id] ?? []);
        if (check.checked) picked.add(item);
        else picked.delete(item);
        draft[block.id] = [...picked];
      });
      row.append(check, element("span", "", item));
      box.append(row);
    });
    return { title: block.label || "Перечень", caption: "отметь пункты, допиши уточнение", body: withNote(box, block, draft) };
  },

  table: (block) => {
    const box = element("div", "w-table");
    const table = element("table");
    const head = element("tr");
    head.append(...block.columns.map((column) => element("th", "", column)));
    const body = element("tbody");
    for (const row of block.rows) {
      const line = element("tr");
      line.append(...row.map((cell) => element("td", "", cell)));
      body.append(line);
    }
    const thead = element("thead");
    thead.append(head);
    table.append(thead, body);
    box.append(table);
    return { title: "Данные", body: box };
  },
};

function panel({ title, caption, body }, index) {
  const section = element("section", "panel span-4 ask-panel");
  section.style.setProperty("--i", index);
  const header = element("header");
  header.append(element("span", "panel-letter", String.fromCharCode(65 + index)), element("h2", "", title));
  if (caption) header.append(element("span", "panel-caption", caption));
  const content = element("div", "panel-body");
  content.append(body);
  section.append(header, content);
  return section;
}

async function sendAnswer(id, draft) {
  const response = await fetch(`/answer/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, answers: draft, notes: draft[NOTE_KEY] ?? {} }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
}

function stampOf(screen, at, lead) {
  const stamp = element("header", "stamp ask-stamp");
  const title = element("div", "stamp-title");
  title.append(element("span", "stamp-eyebrow", "Вопрос агента"), element("h1", "", screen.title));
  if (lead) title.append(element("p", "ask-lead", lead));
  const cell = element("div", "ask-cell");
  const value = element("span", "ask-cell-value");
  value.append(element("span", "ask-pulse"), element("span", "ask-state", "ждёт ответа"));
  const time = new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  cell.append(element("span", "stamp-eyebrow", "Состояние"), value, element("span", "ask-cell-note", `с ${time}`));
  stamp.append(title, cell);
  return stamp;
}

function screenCard({ id, screen, at }) {
  if (!drafts.has(id)) drafts.set(id, {});
  const draft = drafts.get(id);
  const card = element("form", "screen ask");
  card.dataset.testid = "screen";
  card.dataset.askId = id;
  const [first, ...rest] = screen.blocks;
  const lead = first?.kind === "text" ? first.text : "";
  const blocks = lead ? rest : screen.blocks;
  const panels = element("div", "panels");
  panels.append(...blocks.map((block, index) => panel(BLOCKS[block.kind](block, draft), index)));
  const actions = element("div", "ask-actions");
  const status = element("span", "screen-status", "Ответ уйдёт агенту сразу · Ctrl+Enter");
  status.setAttribute("role", "status");
  const submit = element("button", "ask-submit");
  submit.type = "submit";
  submit.dataset.testid = "screen-submit";
  submit.append(element("span", "", screen.submit), element("span", "ask-submit-arrow", "→"));
  actions.append(status, submit);
  card.append(stampOf(screen, at, lead), panels, actions);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !submit.disabled) {
      event.preventDefault();
      card.requestSubmit(submit);
    }
  });
  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.dataset.tone = "";
    status.textContent = "Отправляю…";
    const state = card.querySelector(".ask-state");
    state.textContent = "отправляю";
    try {
      await sendAnswer(id, draft);
      status.textContent = "Отправлено агенту";
      status.dataset.tone = "good";
      card.dataset.sent = "on";
      state.textContent = "обрабатывает";
      answered = true;
    } catch (error) {
      status.textContent = `Не отправлено: ${error.message}`;
      status.dataset.tone = "bad";
      submit.disabled = false;
      state.textContent = "ждёт ответа";
    }
  });
  return card;
}

function show(asks) {
  const open = new Set(asks.map((ask) => ask.id));
  for (const id of drafts.keys()) if (!open.has(id)) drafts.delete(id);
  const kept = new Map([...screensBox.children].map((card) => [card.dataset.askId, card]));
  screensBox.replaceChildren(...asks.map((ask) => kept.get(ask.id) ?? screenCard(ask)));
  if (asks.length) answered = false;
  paintIdle();
  idle.hidden = asks.length > 0;
  document.title = asks.length ? `Вопрос · ${asks[0].screen.title}` : "agent-ui";
}

async function explain({ quote, question, context }) {
  const reply = (result) => window.postMessage({ type: "agent-ui:explain-result", ...result }, location.origin);
  const id = screensBox.firstElementChild?.dataset.askId;
  if (!id) return reply({ ok: false, error: "открытого вопроса нет" });
  try {
    const response = await fetch(`/answer/${encodeURIComponent(id)}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, quote, question, context }),
    });
    const body = await response.json();
    reply(response.ok ? { ok: true, status: body.status, id: body.id } : { ok: false, error: body.error });
  } catch {
    reply({ ok: false, error: "сервер agent-ui не ответил" });
  }
}

window.addEventListener("message", (event) => {
  if (event.source === window && event.data?.type === "agent-ui:explain") explain(event.data);
});

const events = new EventSource("/events");
events.addEventListener("answer", (event) =>
  window.postMessage({ type: "agent-ui:explain-answer", ...JSON.parse(event.data) }, location.origin));
events.addEventListener("asks", (event) => {
  link.textContent = "";
  show(JSON.parse(event.data));
});
events.addEventListener("error", () => {
  link.textContent = "Нет связи с сервером agent-ui. Переподключаюсь.";
});
