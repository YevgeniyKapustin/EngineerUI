import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLink, renderText, safeHref } from "./links.mjs";

test("ссылки сохраняют адрес, скобки и экранирование текста", () => {
  const html = renderText('<b>Источники: https://example.test/a_(b)?x=1&y=2, (https://example.test/c).');
  assert.match(html, /^&#60;b&#62;/);
  assert.match(html, /href="https:\/\/example.test\/a_\(b\)\?x=1&#38;y=2"/);
  assert.match(html, /href="https:\/\/example.test\/c"[^>]*>https:\/\/example.test\/c<\/a>\)\./);
  assert.equal((html.match(/<a /g) ?? []).length, 2);
});

test("пользовательская ссылка не может выполнить код или открыть файл", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "file:///C:/secret", "//example.test", "/\\example.test", "https://example.test\n"])
    assert.equal(safeHref(href), false, href);
  for (const href of ["https://example.test/?x=1&y=2", "http://127.0.0.1:47700/a/test", "/a/test", "#section"])
    assert.equal(safeHref(href), true, href);
  assert.throws(() => parseLink({ href: "javascript:alert(1)" }, "cell.link"), /cell\.link\.href:/);
});
