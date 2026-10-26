import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(repoRoot, "dist", "server.js");

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: repoRoot,
  });
  const client = new Client({ name: "context-diet-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

function parseText(result) {
  const block = result.content[0];
  assert.equal(block.type, "text");
  return JSON.parse(block.text);
}

test("MCP e2e: server lists exactly the 6 diet tools", async () => {
  await withClient(async (client) => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "diet_check",
      "diet_count",
      "diet_dedupe",
      "diet_extract",
      "diet_pack",
      "diet_summarize",
    ]);
  });
});

test("MCP e2e: diet_pack through the real protocol returns a valid manifest", async () => {
  await withClient(async (client) => {
    const text = [
      "# Run",
      "PASS a (1ms)",
      "PASS a (1ms)",
      "Error: disk full on /tmp",
      "PASS b (2ms)",
      "PASS c (3ms)",
    ].join("\n") + "\n";
    const result = await client.callTool({
      name: "diet_pack",
      arguments: { text, budgetTokens: 100 },
    });
    const packed = parseText(result);
    assert.equal(packed.manifest.verbatim, true);
    assert.ok(packed.text.includes("Error: disk full on /tmp"));
    assert.ok(packed.manifest.output.lines < packed.manifest.input.lines);
    assert.equal(
      packed.manifest.output.lines + packed.manifest.droppedLines,
      packed.manifest.input.lines,
    );
  });
});

test("MCP e2e: the documented `serve` entry point works (dist/cli.js serve)", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(repoRoot, "dist", "cli.js"), "serve"],
    cwd: repoRoot,
  });
  const client = new Client({ name: "context-diet-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
  } finally {
    await client.close();
  }
});

test("MCP e2e: diet_count labels tokens as estimates", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "diet_count",
      arguments: { text: "hello\nworld\n" },
    });
    const counts = parseText(result);
    assert.equal(counts.lines, 2);
    assert.equal(counts.bytes, 12);
    assert.ok(counts.tokensNote.includes("estimate"));
  });
});

test("MCP e2e: diet_check through the real protocol reports missing items", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "diet_check",
      arguments: {
        text: "PASS src/a.test.js (1ms)\nFAIL src/b.test.js\n",
        planned: ["src/a.test.js", "src/c.test.js"],
      },
    });
    const check = parseText(result);
    assert.equal(check.survived, false);
    assert.deepEqual(check.missing, ["src/c.test.js"]);
    assert.equal(check.items[0].evidence, "PASS src/a.test.js (1ms)");
  });
});
