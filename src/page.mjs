import { FAVICON_LINK } from "./favicon.mjs";
import { frameClose, frameOpen, sheetCss } from "./sheet-page.mjs";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KIT_DIR = join(import.meta.dirname, "..", "kit");
const KIT_FILES = [
  "base-tokens.css",
  "tokens.css",
  "dark.css",
  "typography.css",
  "button.css",
  "chip.css",
  "text-field.css",
];
const FONT_FACES = [
  ["inter-cyrillic-opsz-normal.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  [
    "inter-latin-opsz-normal.woff2",
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  ],
];

let kit = null;
let assets = null;

export function kitCss() {
  if (kit) return kit;
  const fonts = FONT_FACES.map(([file, range]) => {
    const font = readFileSync(join(KIT_DIR, "fonts", file)).toString("base64");
    return `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2-variations");unicode-range:${range}}`;
  });
  kit = [...fonts, ...KIT_FILES.map((file) => readFileSync(join(KIT_DIR, file), "utf8"))].join("\n");
  return kit;
}

function assetsOf() {
  if (assets) return assets;
  const own = (file) => readFileSync(join(import.meta.dirname, file), "utf8");
  assets = { css: `${kitCss()}\n${sheetCss()}\n${own("page.css")}`, script: own("client.js") };
  return assets;
}

export function pageOf({ token, explain }) {
  const { css, script } = assetsOf();
  const nonce = randomBytes(16).toString("base64");
  const policy = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "font-src data:",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return `<!doctype html>
<html lang="ru" data-kit="v6"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>agent-ui</title>
${FAVICON_LINK}
<style nonce="${nonce}">${css}</style></head>
<body data-token="${token}">
${frameOpen(` data-testid="ask-sheet"`)}
<header class="stamp ask-idle" id="idle" data-testid="idle"><div class="stamp-title"><span class="stamp-eyebrow">Вопросы агента</span><h1 id="idle-title">Вопросов нет</h1><p id="idle-text">Агент пока ничего не спрашивает. Новый вопрос появится здесь сам.</p></div><div class="ask-cell"><span class="stamp-eyebrow">Состояние</span><span class="ask-cell-value"><span class="ask-pulse" aria-hidden="true"></span><span id="idle-state" data-testid="idle-state">ждёт</span></span></div></header>
<div class="screens" id="screens" data-testid="screens" aria-live="polite"></div>
<p class="ask-link" id="link" data-testid="link" role="status"></p>
${frameClose()}
<script nonce="${nonce}">${script}</script>
${explain({ nonce, host: "self" })}</body></html>`;
}
