import test from "node:test";
import assert from "node:assert/strict";
import { dedupeText } from "../dist/dedupe.js";

test("exact duplicate lines are removed, first occurrence kept, order kept", () => {
  const out = dedupeText("a\nb\na\nc\nb\n");
  assert.equal(out.text, "a\nb\nc\n");
  assert.equal(out.removedDuplicateLines, 2);
  assert.equal(out.keptLines, 3);
});

test("repeated multi-line blocks are removed as blocks", () => {
  const out = dedupeText("x\ny\nz\na\nx\ny\nz\n");
  assert.equal(out.text, "x\ny\nz\na\n");
  assert.equal(out.removedDuplicateBlocks, 1);
  assert.equal(out.removedBlockLines, 3);
  assert.equal(out.removedDuplicateLines, 0);
});

test("input without duplicates is unchanged", () => {
  const out = dedupeText("one\ntwo\nthree\n");
  assert.equal(out.text, "one\ntwo\nthree\n");
  assert.equal(out.removedDuplicateLines, 0);
  assert.equal(out.removedDuplicateBlocks, 0);
});
