import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCompleteness } from "../dist/completeness.js";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function runCli({ planned, markers, failMarkers, skipped, stdin }) {
  const dir = mkdtempSync(join(tmpdir(), "diet-check-"));
  const args = ["check", "--root", dir];
  if (planned !== undefined) {
    writeFileSync(join(dir, "planned.txt"), planned);
    args.push("--planned", "planned.txt");
  }
  if (markers !== undefined) {
    writeFileSync(join(dir, "markers.txt"), markers);
    args.push("--markers", "markers.txt");
  }
  if (failMarkers !== undefined) {
    writeFileSync(join(dir, "fail-markers.txt"), failMarkers);
    args.push("--fail-markers", "fail-markers.txt");
  }
  if (skipped !== undefined) {
    writeFileSync(join(dir, "skipped.txt"), skipped);
    args.push("--skipped", "skipped.txt");
  }
  return spawnSync(process.execPath, [CLI, ...args], { input: stdin, encoding: "utf8" });
}

const OUTPUT = [
  "84 tests planned",
  "PASS src/api/users.test.js (12ms)",
  "PASS src/api/orders.test.js (9ms)",
  "FAIL src/api/refunds.test.js — expected 200, got 500",
  "81 tests executed",
].join("\n") + "\n";

test("all planned items found means survived", () => {
  const out = checkCompleteness(OUTPUT, [
    "src/api/users.test.js",
    "src/api/orders.test.js",
    "src/api/refunds.test.js",
  ]);
  assert.equal(out.survived, true);
  assert.equal(out.plannedCount, 3);
  assert.equal(out.foundCount, 3);
  assert.deepEqual(out.missing, []);
});

test("missing items are listed by name with evidence for found items", () => {
  const out = checkCompleteness(OUTPUT, [
    "src/api/users.test.js",
    "src/api/payments.test.js",
    "src/api/refunds.test.js",
  ]);
  assert.equal(out.survived, false);
  assert.deepEqual(out.missing, ["src/api/payments.test.js"]);
  assert.equal(out.missingCount, 1);
  const users = out.items.find((i) => i.item === "src/api/users.test.js");
  assert.equal(users.found, true);
  assert.equal(users.evidence, "PASS src/api/users.test.js (12ms)");
});

test("matching is verbatim and case-sensitive", () => {
  const out = checkCompleteness(OUTPUT, ["SRC/API/USERS.TEST.JS"]);
  assert.equal(out.survived, false);
  assert.deepEqual(out.missing, ["SRC/API/USERS.TEST.JS"]);
});

test("blank planned strings are ignored, not counted", () => {
  const out = checkCompleteness(OUTPUT, ["", "src/api/users.test.js"]);
  assert.equal(out.plannedCount, 1);
  assert.equal(out.survived, true);
});

test("duplicate planned items are checked once", () => {
  const out = checkCompleteness(OUTPUT, [
    "src/api/users.test.js",
    "src/api/users.test.js",
  ]);
  assert.equal(out.plannedCount, 1);
  assert.equal(out.foundCount, 1);
});

test("empty planned list survives vacuously", () => {
  const out = checkCompleteness(OUTPUT, []);
  assert.equal(out.survived, true);
  assert.equal(out.plannedCount, 0);
});

// --- Marker mode (--require-marker) ---

const ECHO = ["Plan: t1", "Plan: t2", "Plan: t3", "Plan: t4", "Plan: t5"].join("\n") + "\n";
const MARKERS = ["PASS", "FAIL", "[run]"];

test("marker mode: a log reciting the plan scores 0 executed-pass, 5 missing", () => {
  const out = checkCompleteness(ECHO, ["t1", "t2", "t3", "t4", "t5"], { markers: MARKERS });
  assert.equal(out.executedPassCount, 0);
  assert.equal(out.executedFailCount, 0);
  assert.equal(out.missingCount, 5);
  assert.deepEqual(out.missing, ["t1", "t2", "t3", "t4", "t5"]);
  assert.equal(out.survived, false);
});

test("marker mode: FAIL line counts as executed-fail via the FAIL default", () => {
  const out = checkCompleteness(OUTPUT, [
    "src/api/users.test.js",
    "src/api/refunds.test.js",
  ], { markers: ["PASS", "FAIL"] });
  const users = out.items.find((i) => i.item === "src/api/users.test.js");
  const refunds = out.items.find((i) => i.item === "src/api/refunds.test.js");
  assert.equal(users.status, "executed-pass");
  assert.equal(refunds.status, "executed-fail");
  assert.equal(refunds.evidence, "FAIL src/api/refunds.test.js — expected 200, got 500");
  assert.equal(out.executedFailCount, 1);
  assert.equal(out.survived, false);
});

test("marker mode: explicit failMarkers override the FAIL default", () => {
  const out = checkCompleteness("DONE t1\nPASS t2\n", ["t1", "t2"], {
    markers: ["PASS", "DONE"],
    failMarkers: ["DONE"],
  });
  assert.equal(out.items.find((i) => i.item === "t1").status, "executed-fail");
  assert.equal(out.items.find((i) => i.item === "t2").status, "executed-pass");
  assert.equal(out.survived, false);
});

test("failMarkers without markers throws", () => {
  assert.throws(
    () => checkCompleteness(OUTPUT, ["src/api/users.test.js"], { failMarkers: ["FAIL"] }),
    /failMarkers requires markers/,
  );
});

test("caller-declared skips are listed by name and never count as missing", () => {
  const out = checkCompleteness("PASS src/api/users.test.js (12ms)\n", [
    "src/api/users.test.js",
    "src/api/payments.test.js",
  ], { markers: ["PASS", "FAIL"], skipped: ["src/api/payments.test.js"] });
  assert.equal(out.items.find((i) => i.item === "src/api/payments.test.js").status, "skipped");
  assert.equal(out.skippedCount, 1);
  assert.deepEqual(out.skipped, ["src/api/payments.test.js"]);
  assert.deepEqual(out.missing, []);
  assert.equal(out.survived, true);
});

test("a skipped item that ran anyway stays skipped with no evidence", () => {
  const out = checkCompleteness("PASS t1\n", ["t1"], { markers: ["PASS"], skipped: ["t1"] });
  const item = out.items[0];
  assert.equal(item.status, "skipped");
  assert.equal(item.found, false);
  assert.equal(item.evidence, undefined);
  assert.equal(out.survived, true);
});

test("markers match on word boundaries, not bare substrings", () => {
  const bypass = checkCompleteness("BYPASS src/api/users.test.js\n", ["src/api/users.test.js"], {
    markers: ["PASS"],
  });
  assert.equal(bypass.items[0].status, "missing");
  const selfLocating = checkCompleteness("[run:src/api/users.test.js] PASS\n", ["src/api/users.test.js"], {
    markers: ["PASS", "[run]"],
  });
  assert.equal(selfLocating.items[0].status, "executed-pass");
});

test("marker mode: the first marked line decides, plan recitals are ignored", () => {
  const out = checkCompleteness("Plan: t1\nPASS t1\n", ["t1"], { markers: ["PASS", "FAIL"] });
  assert.equal(out.items[0].status, "executed-pass");
  assert.equal(out.items[0].evidence, "PASS t1");
  const flaky = checkCompleteness("FAIL t1\nPASS t1\n", ["t1"], { markers: ["PASS", "FAIL"] });
  assert.equal(flaky.items[0].status, "executed-fail");
  assert.equal(flaky.items[0].evidence, "FAIL t1");
});

test("CLI: echo fixture exits 1 with INCOMPLETE on stderr", () => {
  const run = runCli({
    planned: "t1\nt2\nt3\nt4\nt5\n",
    markers: "PASS\nFAIL\n[run]\n",
    stdin: ECHO,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /INCOMPLETE/);
  const result = JSON.parse(run.stdout);
  assert.equal(result.executedPassCount, 0);
  assert.equal(result.missingCount, 5);
  assert.equal(result.survived, false);
});

test("CLI: clean marker run with a declared skip exits 0", () => {
  const run = runCli({
    planned: "t1\nt2\nt3\n",
    markers: "PASS\nFAIL\n",
    skipped: "t3\n",
    stdin: "PASS t1\nPASS t2\n",
  });
  assert.equal(run.status, 0);
  const result = JSON.parse(run.stdout);
  assert.equal(result.survived, true);
  assert.equal(result.executedPassCount, 2);
  assert.equal(result.skippedCount, 1);
});

test("CLI: fail-markers without markers exits 1", () => {
  const run = runCli({
    planned: "t1\n",
    failMarkers: "FAIL\n",
    stdin: "PASS t1\n",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /failMarkers requires markers/);
});
