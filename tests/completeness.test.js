import test from "node:test";
import assert from "node:assert/strict";
import { checkCompleteness } from "../dist/completeness.js";

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
