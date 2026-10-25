import test from "node:test";
import assert from "node:assert/strict";
import { splitLines, countText, estimateTokens, stripAnsi } from "../dist/tokens.js";

test("splitLines handles empty, trailing newline, and unterminated input", () => {
  assert.deepEqual(splitLines(""), []);
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\nb"), ["a", "b"]);
});

test("estimateTokens uses the documented chars/4 rule", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens(""), 0);
});

test("countText reports exact lines/bytes and estimated tokens", () => {
  const counts = countText("hello\nworld\n");
  assert.equal(counts.lines, 2);
  assert.equal(counts.bytes, 12);
  assert.equal(counts.estTokens, 3);
});

test("stripAnsi removes color and cursor codes", () => {
  assert.equal(stripAnsi("\x1b[31mred\x1b[0m plain"), "red plain");
});
