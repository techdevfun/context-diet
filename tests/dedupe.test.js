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

test("lines differing only by 0x addresses collapse as near-duplicates, first kept verbatim", () => {
  const trace = (addr) =>
    `Error: segfault in worker pool\n  at worker.run (src/worker.cc:41) [${addr}]\n`;
  const input = trace("0x00007f8a3b2c100") + trace("0x00007f9c4d3e200");
  const out = dedupeText(input);
  assert.equal(out.text, trace("0x00007f8a3b2c100"));
  assert.equal(out.removedNearDuplicateLines, 1);
  // The repeated "Error:" line itself is byte-identical, so it counts as exact.
  assert.equal(out.removedDuplicateLines, 1);
});

test("repeated blocks differing only by addresses collapse as near blocks", () => {
  const block = (a, b) =>
    `Error: segfault\n  at f (x.cc:1) [${a}]\n  at g (y.cc:2) [${b}]\n`;
  const input = block("0x111", "0x222") + block("0x333", "0x444");
  const out = dedupeText(input);
  assert.equal(out.text, block("0x111", "0x222"));
  assert.equal(out.removedNearDuplicateBlocks, 1);
  assert.equal(out.removedNearBlockLines, 3);
  assert.equal(out.removedDuplicateBlocks, 0);
});

test("exactOnly restores strict byte-identical behavior", () => {
  const trace = (addr) =>
    `Error: segfault in worker pool\n  at worker.run (src/worker.cc:41) [${addr}]\n`;
  const input = trace("0x00007f8a3b2c100") + trace("0x00007f9c4d3e200");
  const out = dedupeText(input, { exactOnly: true });
  // Exact-only still collapses the byte-identical "Error:" line; only the
  // address-differing frame line survives, because near matching is off.
  assert.equal(out.text, `Error: segfault in worker pool\n  at worker.run (src/worker.cc:41) [0x00007f8a3b2c100]\n  at worker.run (src/worker.cc:41) [0x00007f9c4d3e200]\n`);
  assert.equal(out.removedNearDuplicateLines, 0);
  assert.equal(out.removedDuplicateLines, 1);
});

test("bare hex without a 0x prefix is left exact", () => {
  const out = dedupeText("request abc123def456 failed\nrequest 7890abcd1234 failed\n");
  assert.equal(out.text, "request abc123def456 failed\nrequest 7890abcd1234 failed\n");
  assert.equal(out.removedNearDuplicateLines, 0);
});

test("byte-identical lines containing 0x count as exact, not near", () => {
  const out = dedupeText("  at f (x.cc:1) [0x123]\n  at f (x.cc:1) [0x123]\n");
  assert.equal(out.removedDuplicateLines, 1);
  assert.equal(out.removedNearDuplicateLines, 0);
});
