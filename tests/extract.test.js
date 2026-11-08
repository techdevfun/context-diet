import test from "node:test";
import assert from "node:assert/strict";
import { extractText } from "../dist/extract.js";

const DOC = [
  "Introduction to the service.",
  "The database connection pool is configured here.",
  "Unrelated paragraph about lunch menus.",
  "Error: database timeout after 30s.",
  "More lunch details nobody asked for.",
  "The pool retries twice before failing.",
].join("\n") + "\n";

test("extract returns query hits in original document order", () => {
  const out = extractText(DOC, "database timeout", { windowLines: 0 });
  assert.ok(out.text.includes("Error: database timeout after 30s."));
  assert.ok(out.text.includes("The database connection pool is configured here."));
  assert.ok(!out.text.includes("lunch"));
});

test("error lines score even without a query term match", () => {
  const out = extractText(DOC, "zzzz-no-such-term", { windowLines: 0 });
  assert.ok(out.text.includes("Error: database timeout after 30s."));
});

test("an innocent line mentioning code does not outrank a genuine query hit", () => {
  // Regression: the old error regex boosted ANY line with an
  // e-word followed by "code"/"error" ("see the example code..."),
  // so with maxChunks=1 it displaced the real hit for "deploy".
  const doc = [
    "deploy the new build now",
    "filler one",
    "filler two",
    "filler three",
    "filler four",
    "filler five",
    "see the example code in the docs",
    "filler six",
  ].join("\n") + "\n";
  const out = extractText(doc, "deploy", { windowLines: 2, maxChunks: 1 });
  assert.ok(out.text.includes("deploy the new build now"));
  assert.ok(!out.text.includes("see the example code"));
});

test("real error-code lines still score: exit code and E-code tokens", () => {
  const doc = [
    "filler one",
    "filler two",
    "filler three",
    "filler four",
    "filler five",
    "process ended with exit code 1",
    "filler six",
    "filler seven",
    "filler eight",
    "filler nine",
    "filler ten",
    "request returned E401",
  ].join("\n") + "\n";
  const out = extractText(doc, "zzzz-no-such-term", { windowLines: 0 });
  assert.ok(out.text.includes("process ended with exit code 1"));
  assert.ok(out.text.includes("request returned E401"));
});

test("context windows merge overlapping hits into one chunk", () => {
  const out = extractText(DOC, "database", { windowLines: 2 });
  assert.equal(out.chunks.length, 1);
});
