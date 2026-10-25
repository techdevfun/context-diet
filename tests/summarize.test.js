import test from "node:test";
import assert from "node:assert/strict";
import { summarizeText } from "../dist/summarize.js";
import { splitLines, estimateTokens } from "../dist/tokens.js";

const DOC = [
  "# Deployment notes",
  "",
  "The deploy went out at noon.",
  "Step one finished without incident.",
  "Step two finished without incident.",
  "Step three finished without incident.",
  "Error: database migration failed on users table.",
  "Step four finished without incident.",
  "Step five finished without incident.",
  "2026-10-25T10:00:00Z",
  "· ─ ─ ─",
  "Final note: rollback plan is documented.",
].join("\n") + "\n";

test("summarize output lines are all verbatim input lines (never invented)", () => {
  const out = summarizeText(DOC, 500);
  const inputLines = new Set(splitLines(DOC));
  for (const line of splitLines(out.text)) {
    assert.ok(inputLines.has(line), `output line not in input: ${line}`);
  }
});

test("error lines and headings survive a tight budget", () => {
  const out = summarizeText(DOC, 25);
  assert.ok(out.text.includes("Error: database migration failed on users table."));
  assert.ok(out.text.includes("# Deployment notes"));
});

test("summary respects the token budget", () => {
  const out = summarizeText(DOC, 40);
  assert.ok(estimateTokens(out.text) <= 40 || splitLines(out.text).length === 1);
});

test("noise lines (blank, timestamp-only, decoration) are dropped and counted", () => {
  const out = summarizeText(DOC, 500);
  assert.ok(out.droppedNoiseLines >= 3);
  assert.ok(!out.text.includes("2026-10-25T10:00:00Z"));
});
