const base = process.env.AGENT_UI_URL ?? "http://127.0.0.1:47700";

const screen = {
  title: "Куда отправить изменения?",
  blocks: [
    { kind: "text", text: "Ветка готова, проверки прошли. Решите, как её отдать." },
    {
      kind: "table",
      columns: ["Проверка", "Итог"],
      rows: [
        ["тесты", "50 из 50"],
        ["eslint", "без замечаний"],
      ],
    },
    { kind: "choice", id: "target", label: "Целевая ветка", options: ["release", "main"] },
    {
      kind: "checklist",
      id: "after",
      label: "После MR",
      items: ["перевести карточку в Ready for Testing", "приложить снимок"],
    },
    { kind: "input", id: "note", label: "Комментарий", multiline: true },
  ],
  submit: "Отправить агенту",
};

process.stdout.write(`Жду ответа на ${base} …\n`);
const response = await fetch(`${base}/ask`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(screen),
});
process.stdout.write(`${response.status} ${JSON.stringify(await response.json(), null, 2)}\n`);
