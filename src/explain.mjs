const EXPLAIN_CSS = `
:host{all:initial;--paper:#fff;--stripe:#f4f4f2;--ink:#1c1c1c;--muted:#6b6b6b;--line:#d9d9d6;--frame:#1c1c1c;--good:#2f6b3a;--bad:#a1302b;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace;font:13px/1.4 system-ui,sans-serif;color:var(--ink)}
@media (prefers-color-scheme:dark){:host{--paper:#1a1a1a;--ink:#ececea;--muted:#9b9b98;--line:#343432;--frame:#d6d6d3;--stripe:#202020;--good:#7cc58a;--bad:#ef7d76}}
[hidden]{display:none!important}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,textarea:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.trigger{position:fixed;z-index:2147483646;padding:3px 10px;border:1px solid var(--frame);background:var(--paper);font:11px var(--mono);letter-spacing:.06em;text-transform:uppercase;box-shadow:0 4px 12px rgb(0 0 0/.14)}
.trigger{display:flex;align-items:center;gap:6px;transition:background-color .12s}
.trigger span{transition:transform .12s}
.trigger:hover{background:var(--stripe)}
.trigger:hover span{transform:translateX(3px)}
.actions button{transition:background-color .12s}
.actions .cancel:hover{background:var(--stripe)}
.actions .send:hover:not(:disabled){background:color-mix(in srgb,var(--ink) 86%,var(--paper))}
.card{position:fixed;z-index:2147483647;width:min(380px,calc(100vw - 24px));border:1px solid var(--frame);background:var(--paper);box-shadow:0 8px 24px rgb(0 0 0/.18)}
.card header{padding:6px 10px;border-bottom:1px solid var(--frame);font:11px var(--mono);letter-spacing:.08em;text-transform:uppercase}
.quote{margin:10px 10px 0;padding:6px 8px;border-left:3px solid var(--ink);background:color-mix(in srgb,var(--ink) 6%,transparent);max-height:96px;overflow:auto;white-space:pre-wrap;word-break:break-word}
textarea{display:block;box-sizing:border-box;width:calc(100% - 20px);margin:10px;min-height:64px;resize:vertical;padding:6px 8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit}
.actions{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 10px 10px}
.hint{color:var(--muted);font:11px var(--mono)}
.actions div{display:flex;gap:6px}
.actions button{padding:3px 12px;border:1px solid var(--frame);background:transparent}
.actions .send{background:var(--ink);color:var(--paper)}
.answer{margin:0 10px 10px;padding:8px;border:1px solid var(--line);max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;user-select:text}
.status{margin:0 10px 10px;font:12px var(--mono)}
.status[data-tone=good]{color:var(--good)}
.status[data-tone=bad]{color:var(--bad)}
`;

export function explainScript({ nonce, host: mode = "parent" } = {}) {
  const attribute = nonce ? ` nonce="${nonce}"` : "";
  return `<script${attribute}>
(() => {
  const target = ${mode === "self" ? "window" : "window.parent"};
  if (${mode === "self" ? "false" : "target === window"}) return;
  const host = document.createElement("agent-ui-explain");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = \`<style${attribute}>${EXPLAIN_CSS}</style>
<button class="trigger" type="button" data-testid="explain-trigger" hidden>Спросить агента <span aria-hidden="true">→</span></button>
<div class="card" role="dialog" aria-label="Вопрос агенту о фрагменте" data-testid="explain-card" hidden>
<header>Вопрос агенту</header>
<div class="quote" data-testid="explain-quote"></div>
<textarea data-testid="explain-question" placeholder="Расскажи подробнее" aria-label="Вопрос"></textarea>
<div class="answer" data-testid="explain-answer" hidden></div>
<p class="status" data-testid="explain-status" role="status" hidden></p>
<div class="actions"><span class="hint">Ctrl+Enter</span><div>
<button type="button" class="cancel" data-testid="explain-cancel">Отмена</button>
<button type="button" class="send" data-testid="explain-send">Спросить</button></div></div>
</div>\`;
  document.documentElement.append(host);
  const trigger = root.querySelector(".trigger");
  const card = root.querySelector(".card");
  const quote = root.querySelector(".quote");
  const question = root.querySelector("textarea");
  const status = root.querySelector(".status");
  const sendButton = root.querySelector(".send");
  const answer = root.querySelector(".answer");
  const cancelButton = root.querySelector(".cancel");
  let picked = null;
  let waiting = null;
  let sending = null;

  function place(node, rect) {
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    node.style.left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) + "px";
    node.style.top = (rect.bottom + 6 + height > innerHeight ? Math.max(12, rect.top - height - 6) : rect.bottom + 6) + "px";
  }

  function contextOf(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const section = element?.closest("section, article");
    return (section?.querySelector("h1, h2, h3")?.textContent ?? document.title).trim().slice(0, 200);
  }

  function pick() {
    const selection = getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!card.hidden || text.length < 2 || !selection.rangeCount || host.contains(selection.anchorNode)) {
      trigger.hidden = true;
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    picked = { quote: text.slice(0, 2000), context: contextOf(selection.anchorNode), rect };
    trigger.hidden = false;
    place(trigger, rect);
  }

  function close() {
    card.hidden = true;
    trigger.hidden = true;
    picked = null;
    waiting = null;
    clearTimeout(sending);
  }

  function open() {
    trigger.hidden = true;
    quote.textContent = picked.quote.length > 400 ? picked.quote.slice(0, 400) + "…" : picked.quote;
    question.value = "";
    question.hidden = false;
    answer.hidden = true;
    status.hidden = true;
    sendButton.disabled = false;
    sendButton.hidden = false;
    cancelButton.textContent = "Отмена";
    card.hidden = false;
    place(card, picked.rect);
    question.focus();
  }

  function report(text, tone) {
    status.textContent = text;
    status.dataset.tone = tone;
    status.hidden = false;
  }

  function send() {
    if (!picked || sendButton.disabled) return;
    sendButton.disabled = true;
    report("Отправляю…", "info");
    sending = setTimeout(() => {
      sendButton.disabled = false;
      report("Страница не ответила. Обнови вкладку (F5) и спроси снова.", "bad");
    }, 5000);
    target.postMessage({ type: "agent-ui:explain", quote: picked.quote, context: picked.context, question: question.value.trim() }, "*");
  }

  function result({ ok, status: mode, id, listening, error }) {
    clearTimeout(sending);
    if (!ok) {
      sendButton.disabled = false;
      return report("Не отправлено: " + error, "bad");
    }
    if (mode === "forked") {
      waiting = id;
      return report("Форк сессии думает над ответом…", "info");
    }
    if (mode === "returned") {
      report("Вопрос ушёл агенту вместо ответа. Агент ответит и спросит снова.", "good");
      return setTimeout(close, 2600);
    }
    report(listening ? "Агент получил вопрос. Ответ придёт новой версией листа." : "Вопрос в очереди. Агент заберёт его, когда проверит вопросы.", "good");
    setTimeout(close, 2600);
  }

  function answered({ id, ok, text, error }) {
    if (id !== waiting) return;
    waiting = null;
    sendButton.disabled = false;
    if (!ok) return report("Форк не ответил: " + error, "bad");
    question.hidden = true;
    answer.textContent = text;
    answer.hidden = false;
    status.hidden = true;
    sendButton.hidden = true;
    cancelButton.textContent = "Закрыть";
  }

  addEventListener("message", (event) => {
    if (event.source !== target) return;
    if (event.data?.type === "agent-ui:explain-result") result(event.data);
    if (event.data?.type === "agent-ui:explain-answer") answered(event.data);
  });
  document.addEventListener("mouseup", (event) => { if (event.target !== host) setTimeout(pick); });
  document.addEventListener("keyup", (event) => { if (event.shiftKey && event.target !== host) pick(); });
  document.addEventListener("mousedown", (event) => { if (event.target !== host) close(); });
  addEventListener("scroll", () => { trigger.hidden = true; }, { passive: true });
  trigger.addEventListener("mousedown", (event) => event.preventDefault());
  trigger.addEventListener("click", open);
  cancelButton.addEventListener("click", close);
  sendButton.addEventListener("click", send);
  question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send();
    if (event.key === "Escape") close();
  });
})();
</script>`;
}

export const EXPLAIN_SCRIPT = explainScript();
