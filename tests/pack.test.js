import test from "node:test";
import assert from "node:assert/strict";
import { packText } from "../dist/pack.js";
import { splitLines, estimateTokens } from "../dist/tokens.js";

function sessionLog() {
  const lines = [];
  lines.push("# CI run 4821 — test job");
  for (let i = 0; i < 20; i++) {
    lines.push(`PASS src/checks/test-${i}.test.js (${i}ms)`);
  }
  lines.push("PASS src/checks/test-3.test.js (3ms)"); // exact duplicate
  lines.push("Error: database timeout after 30s in pool.connect()");
  lines.push("  at pool.connect (db/pool.js:41:15)");
  lines.push("  at runSuite (test/runner.js:88:3)");
  for (let i = 0; i < 20; i++) {
    lines.push(`ok ${i} - unrelated progress marker`);
  }
  lines.push("FAIL src/api/users.test.js — expected 200, got 500");
  lines.push("Final verdict: 2 failures out of 41 tests.");
  return lines.join("\n") + "\n";
}

test("pack manifest arithmetic holds: output + dropped == input", () => {
  const input = sessionLog();
  const { text, manifest } = packText(input, { budgetTokens: 200 });
  const inputLines = splitLines(input).length;
  const outputLines = splitLines(text).length;
  assert.equal(outputLines + manifest.droppedLines, inputLines);
  assert.equal(manifest.verbatim, true);
});

test("pack respects the token budget", () => {
  const { text } = packText(sessionLog(), { budgetTokens: 120 });
  assert.ok(estimateTokens(text) <= 120 || splitLines(text).length === 1);
});

test("pack keeps error lines and includes an extract stage only with a query", () => {
  const withQuery = packText(sessionLog(), { budgetTokens: 500, query: "database" });
  assert.ok(withQuery.text.includes("Error: database timeout after 30s"));
  assert.ok(withQuery.manifest.stages.some((s) => s.stage === "extract"));
  const noQuery = packText(sessionLog(), { budgetTokens: 500 });
  assert.ok(!noQuery.manifest.stages.some((s) => s.stage === "extract"));
});

test("pack on a real bloated log reduces lines substantially", () => {
  const { text, manifest } = packText(sessionLog(), { budgetTokens: 150 });
  assert.ok(splitLines(text).length < splitLines(sessionLog()).length / 2);
  assert.ok(manifest.output.estTokens < manifest.input.estTokens);
});
