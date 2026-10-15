import { FieldError, fail, text, texts } from "./fields.mjs";

const SENTENCE_WORDS = 25;
const QUOTE_CHARS = 60;
const REPORTED_PLACES = 30;

const WORD = /[\p{L}\p{N}]/u;
const SENTENCE_END = /(?<=[.!?…])\s+(?=[«"(]?[\p{Lu}\p{N}])/u;
const PASSIVE =
  /(?<!\p{L})(?:был[аои]?|будут?|быть)\s+(?:(?:уже|не|ещё|бы)\s+)?((?:пере|пред|при|про|под|раз|рас|воз|вос|над|об|от|по|за|на|вы|до|из|ис|со|вз|вс|с|у|о|в)\p{L}+(?:ан|ян|ен|ён|ыт|ят)[аоы]?)(?!\p{L})/iu;
const NOT_PARTICIPLE = new Set(
  "нужен нужна нужно нужны должен должна должно должны равен равна равно равны способен способна способно способны согласен согласна согласно согласны уверен уверена уверено уверены виден видна видно видны важен важна важно важны ясен ясна ясно ясны свободен свободна свободно свободны полон полна полно полны болен больна больно больны готов сыт сыта сыто сыты"
    .split(" "),
);
const FILLER = [
  "в целом",
  "по сути",
  "на самом деле",
  "как бы",
  "в принципе",
  "кстати",
  "безусловно",
  "разумеется",
  "собственно",
  "в общем-то",
  "очевидно",
  "по большому счёту",
  "стоит отметить",
  "следует отметить",
  "важно отметить",
  "надо сказать",
  "весьма",
  "крайне",
  "абсолютно",
  "очень",
];
const FILLER_PATTERN = new RegExp(`(?<!\\p{L})(${FILLER.join("|")})(?!\\p{L})`, "iu");

const quote = (value) => (value.length > QUOTE_CHARS ? `${value.slice(0, QUOTE_CHARS)}…` : value);

function checkQuestionChannel(value, where) {
  const instructions = value.replace(/«[^»]*»|"[^"\n]*"|`[^`\n]*`/gu, " ");
  if (/(?<!\p{L})ответ(?:ь|ьте)\s+(?:[^.!?\n]{0,100}\s)?в\s+чате(?!\p{L})/iu.test(instructions))
    fail(where, "вопрос требует экрана ask.mjs; после таймаута опубликуй ожидание, без просьбы ответить в чате");
}

function sentencesOf(value) {
  return value
    .replace(/`[^`\n]*`/g, "код")
    .split(/\r?\n/)
    .flatMap((line) => line.split(SENTENCE_END))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function steProblems(value) {
  const problems = [];
  for (const sentence of sentencesOf(value)) {
    const words = sentence.split(/\s+/).filter((token) => WORD.test(token)).length;
    if (words > SENTENCE_WORDS)
      problems.push(`в предложении ${words} слов, предел ${SENTENCE_WORDS}: «${quote(sentence)}» — раздели на два`);
    const passive = PASSIVE.exec(sentence);
    if (passive && !NOT_PARTICIPLE.has(passive[1].toLowerCase()))
      problems.push(`пассивный залог «${passive[0]}» — пиши действием: кто что делает`);
    const filler = FILLER_PATTERN.exec(sentence);
    if (filler) problems.push(`вводное слово или оценка «${filler[1]}» — убери`);
  }
  return problems;
}

let enforced = true;
let found = null;

function steReport(places) {
  const shown = places.slice(0, REPORTED_PLACES).map((place, index) => `${index + 1}) ${place}`);
  const hidden = places.length > REPORTED_PLACES ? ` …и ещё ${places.length - REPORTED_PLACES}` : "";
  return `текст нарушает ASD-STE100, мест: ${places.length}. Исправь все и опубликуй снова: ${shown.join(" ")}${hidden}`;
}

export function steChecked(parse) {
  found = [];
  try {
    const result = parse();
    if (found.length) throw new FieldError(steReport(found));
    return result;
  } finally {
    found = null;
  }
}

export function storedText(parse) {
  enforced = false;
  try {
    return parse();
  } finally {
    enforced = true;
  }
}

export function checkSte(value, where) {
  if (!enforced) return value;
  checkQuestionChannel(value, where);
  const problems = steProblems(value);
  if (!problems.length) return value;
  if (found) found.push(`${where}: ${problems.join("; ")}`);
  else fail(where, `текст нарушает ASD-STE100: ${problems.join("; ")}`);
  return value;
}

export function prose(value, where, options) {
  const given = text(value, where, options);
  return given === undefined ? given : checkSte(given, where);
}

export function proses(value, where) {
  return texts(value, where).map((item, index) => checkSte(item, `${where}[${index}]`));
}

const SKIPPED_ELEMENTS = /<(script|style|pre|code|svg|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS = /<\/?(?:p|div|li|ul|ol|h[1-6]|td|th|tr|table|section|header|footer|article|aside|main|nav|figure|figcaption|blockquote|dt|dd|dl|br|hr|title|button|label|summary|details|caption)\b[^>]*>/gi;
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…" };

export function checkHtmlSte(html, where) {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(SKIPPED_ELEMENTS, "\n")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#?\w+);/g, (entity, name) => ENTITIES[name] ?? entity);
  checkQuestionChannel(visible, where);
  const problems = visible
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(steProblems);
  if (problems.length) fail(where, steReport(problems));
}
