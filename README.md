# EngineerUI

Агент отвечает человеку страницей, а не текстом в терминале. Страница — заметка,
лист виджетов в стиле чертежа или экран вопроса. Человек отвечает на экране,
агент получает ответ структурой JSON.

Работает с Claude Code, Codex и omp. Нужен Node 24, зависимостей нет.

## Установка

```bash
git clone https://github.com/YevgeniyKapustin/EngineerUI.git
cd EngineerUI
npm run rules:install
```

`rules:install` пишет правила общения страницами в `~/.claude/CLAUDE.md` и
`~/.codex/AGENTS.md` (его читают Codex и omp). Правила стоят между метками
`<!-- agent-ui:begin -->` и `<!-- agent-ui:end -->`; остальной текст файлов
команда не трогает. Пути к скриптам в правилах — путь этой копии репозитория.
Перенесли каталог — запустите `rules:install` снова.

| Команда                   | Что делает                                   |
| ------------------------- | -------------------------------------------- |
| `npm run rules:install`   | добавляет или обновляет блок правил          |
| `npm run rules:uninstall` | убирает блок правил                          |
| `npm run rules:status`    | показывает, где стоит блок                   |

Проверка после установки:

```bash
node scripts/publish.mjs examples/widgets.json --id widgets
# http://127.0.0.1:47700/a/widgets
```

Начните новую сессию агента: правила читаются на старте.

## Как это работает

- `scripts/publish.mjs` публикует заметку, лист JSON или HTML и печатает ссылку
  `http://127.0.0.1:47700/a/<slug>`. Сервер команда поднимает сама, лог —
  `~/.agent-ui/server.log`, страницы — `~/.agent-ui/artifacts`.
- `scripts/ask.mjs` открывает экран вопроса и ждёт ответа до 10 минут. В stdout
  приходит `{"status":"answered","answers":{...}}` или `{"status":"timeout"}`.
- На любом листе человек выделяет фразу и жмёт «Спросить агента». Лист от
  сессии Claude Code получает ответ форка этой сессии (`--fork-session`, только
  Read, Grep и Glob) прямо в карточке. Вопрос к листу другого агента ложится в
  очередь: её забирает `scripts/inbox.mjs --id <slug> --wait`.
- Сервер слушает только 127.0.0.1. Страница открывается в iframe с `sandbox`:
  её скрипт не публикует страницы и не отвечает на вопросы.
- Текст листа сервер проверяет по ASD-STE100: длинное предложение, пассив и
  вводное слово дают 400 с фразой.

Правила для агента — [docs/agent-instructions.md](docs/agent-instructions.md).
Все виджеты — [examples/widgets.json](examples/widgets.json).

| Переменная            | По умолчанию          |
| --------------------- | --------------------- |
| `AGENT_UI_PORT`       | `47700`               |
| `AGENT_UI_TIMEOUT_MS` | `600000`              |
| `AGENT_UI_ARTIFACTS`  | `~/.agent-ui/artifacts` |
| `AGENT_UI_HOME`       | домашний каталог, куда `rules:install` пишет правила |

## Разработка

```bash
npm start   # сервер на http://127.0.0.1:47700
npm run demo
npm test
```

Шрифт Inter — под лицензией SIL OFL, текст в [kit/fonts/LICENSE](kit/fonts/LICENSE).
