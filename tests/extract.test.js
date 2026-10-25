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

test("context windows merge overlapping hits into one chunk", () => {
  const out = extractText(DOC, "database", { windowLines: 2 });
  assert.equal(out.chunks.length, 1);
});
