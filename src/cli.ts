#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { countText, splitLines } from "./tokens.js";
import { dedupeText } from "./dedupe.js";
import { extractText } from "./extract.js";
import { summarizeText } from "./summarize.js";
import { packText } from "./pack.js";
import { checkCompleteness } from "./completeness.js";

const USAGE = `context-diet <tool> [options]
Tools: count | dedupe | extract | summarize | pack | check | serve (MCP server over stdio)
Options:
  --input <file>   Read input from a file (must be under --root; default: stdin)
  --root <dir>     Allowed root for --input (default: current working directory)
  --query <text>   Query for extract / pack
  --budget <n>     Token budget for summarize / pack (default 500)
  --exact-only     Dedupe/pack: strict byte-identical matching only (no near-duplicate collapse)
  --protect-file <file>  Lines that must survive summarize/pack (one verbatim line per line; blank lines ignored; must be under --root)
  --protect-mode <fail|partial>  Over-budget protection: fail (default, throw) or partial (diagnostics-only, shortfall flagged)
  --planned <file> Planned items for check (one per line; blank lines ignored; must be under --root)
  --text           Print only the reduced text (default: JSON with manifest)
`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key === "text" || key === "exact-only") {
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

function readProtectFile(args: Record<string, string | boolean>): string[] {
  return readListFile(args, "protect-file");
}

function readPlannedFile(args: Record<string, string | boolean>): string[] {
  return readListFile(args, "planned");
}

function readListFile(args: Record<string, string | boolean>, key: string): string[] {
  if (typeof args[key] !== "string" || args[key] === "") {
    return [];
  }
  const root = resolve(String(args["root"] ?? process.cwd()));
  const file = resolve(root, String(args[key]));
  const rel = relative(root, file);
  if (rel.startsWith(".." + sep) || rel === ".." || resolve(file) === root) {
    throw new Error(`Refusing to read outside --root: ${args[key]}`);
  }
  // One item per line; blank lines carry no meaning and are ignored.
  // A trailing \r (Windows line endings) is stripped so the same file
  // works on both line-ending conventions.
  return splitLines(readFileSync(file, "utf8"))
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter((l) => l !== "");
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
  const protectLines = readProtectFile(args);
  const protectMode = args["protect-mode"] === "partial" ? "partial" : "fail";
  let result: unknown;
  switch (tool) {
    case "count":
      result = countText(text);
      break;
    case "dedupe":
      result = dedupeText(text, { exactOnly: args["exact-only"] === true });
      break;
    case "extract":
      result = extractText(text, String(args["query"] ?? ""));
      break;
    case "summarize":
      result = summarizeText(text, budget, { protectLines, protectMode });
      break;
    case "pack":
      result = packText(text, {
        budgetTokens: budget,
        query: typeof args["query"] === "string" ? args["query"] : undefined,
        exactOnly: args["exact-only"] === true,
        protectLines,
        protectMode,
      });
      break;
    case "check": {
      // Two channels, per the completeness design: stdout carries the
      // durable sidecar record; a non-zero exit is the loud channel
      // (CI red) that fires only when a sentinel did not survive.
      // Quiet when OK, loud when broken — never the reverse.
      const planned = readPlannedFile(args);
      const check = checkCompleteness(text, planned);
      if (!check.survived) {
        process.stderr.write(
          `diet_check: INCOMPLETE — ${check.missingCount} of ${check.plannedCount} planned items missing from output (see manifest).\n`,
        );
        process.exitCode = 1;
      }
      if (asText) {
        process.stdout.write(
          (check.survived
            ? `COMPLETE (${check.foundCount}/${check.plannedCount} planned items found)\n`
            : `INCOMPLETE (${check.foundCount}/${check.plannedCount} found; ${check.missingCount} missing)\n`) +
            check.missing.map((m) => `${m}\n`).join(""),
        );
      } else {
        process.stdout.write(JSON.stringify(check, null, 2) + "\n");
      }
      return;
    }
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
