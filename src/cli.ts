#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { countText } from "./tokens.js";
import { dedupeText } from "./dedupe.js";
import { extractText } from "./extract.js";
import { summarizeText } from "./summarize.js";
import { packText } from "./pack.js";

const USAGE = `context-diet <tool> [options]
Tools: count | dedupe | extract | summarize | pack | serve (MCP server over stdio)
Options:
  --input <file>   Read input from a file (must be under --root; default: stdin)
  --root <dir>     Allowed root for --input (default: current working directory)
  --query <text>   Query for extract / pack
  --budget <n>     Token budget for summarize / pack (default 500)
  --text           Print only the reduced text (default: JSON with manifest)
`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key === "text") {
        out[key] = true;
      } else {
        out[key] = argv[++i] ?? "";
      }
    } else {
      positional.push(arg);
    }
  }
  out["_tool"] = positional[0] ?? "";
  return out;
}

function readInput(args: Record<string, string | boolean>): string {
  if (typeof args["input"] === "string" && args["input"] !== "") {
    const root = resolve(String(args["root"] ?? process.cwd()));
    const file = resolve(root, String(args["input"]));
    const rel = relative(root, file);
    if (rel.startsWith(".." + sep) || rel === ".." || resolve(file) === root) {
      throw new Error(`Refusing to read outside --root: ${args["input"]}`);
    }
    return readFileSync(file, "utf8");
  }
  return readFileSync(0, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tool = String(args["_tool"] ?? "");
  if (tool === "serve") {
    const { runServer } = await import("./server.js");
    await runServer();
    return;
  }
  if (!tool || tool === "--help" || tool === "-h") {
    process.stdout.write(USAGE);
    process.exit(tool ? 0 : 1);
  }
  const text = readInput(args);
  const budget = Number(args["budget"] ?? 500);
  const asText = args["text"] === true;
  let result: unknown;
  switch (tool) {
    case "count":
      result = countText(text);
      break;
    case "dedupe":
      result = dedupeText(text);
      break;
    case "extract":
      result = extractText(text, String(args["query"] ?? ""));
      break;
    case "summarize":
      result = summarizeText(text, budget);
      break;
    case "pack":
      result = packText(text, {
        budgetTokens: budget,
        query: typeof args["query"] === "string" ? args["query"] : undefined,
      });
      break;
    default:
      process.stderr.write(`Unknown tool: ${tool}\n${USAGE}`);
      process.exit(1);
  }
  if (asText && typeof result === "object" && result !== null && "text" in result) {
    process.stdout.write(String((result as { text: string }).text));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
});
