import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { countText } from "./tokens.js";
import { dedupeText } from "./dedupe.js";
import { extractText } from "./extract.js";
import { summarizeText } from "./summarize.js";
import { packText } from "./pack.js";

const MAX_INPUT_CHARS = 1_000_000;

function checkSize(text: string): void {
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Input too large: ${text.length} chars exceeds the ${MAX_INPUT_CHARS} cap. Split the input or raise the cap.`,
    );
  }
}

function textResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "context-diet",
    version: "0.3.0",
  });

  server.tool(
    "diet_count",
    "Count lines, bytes, and estimated tokens of a text. Token counts are estimates (chars/4 rule) and are labeled as such; lines/bytes are exact.",
    { text: z.string().describe("The text to measure.") },
    async ({ text }) => {
      checkSize(text);
      const counts = countText(text);
      return textResult({ ...counts, tokensNote: "estTokens is an estimate (chars/4 rule); lines and bytes are exact." });
    },
  );

  server.tool(
    "diet_dedupe",
    "Remove duplicate lines and repeated multi-line blocks, preserving order. Lines differing only in 0x memory addresses count as near-duplicates: the first occurrence is kept verbatim and near removals are counted separately from exact ones. Pass exactOnly=true for strict byte-identical matching only. Returns deduped text plus counts for the manifest.",
    {
      text: z.string().describe("The text to dedupe."),
      exactOnly: z.boolean().optional().describe("When true, only byte-identical lines/blocks are treated as duplicates (default false)."),
    },
    async ({ text, exactOnly }) => {
      checkSize(text);
      return textResult(dedupeText(text, { exactOnly: exactOnly ?? false }));
    },
  );

  server.tool(
    "diet_extract",
    "Return the most relevant excerpts for a query, with a context window around each hit. Output lines are verbatim from the input.",
    {
      text: z.string().describe("The text to search."),
      query: z.string().describe("The query terms."),
      windowLines: z.number().int().min(0).max(20).optional().describe("Context lines around each hit (default 2)."),
      maxChunks: z.number().int().min(1).max(50).optional().describe("Maximum excerpts to return (default 10)."),
    },
    async ({ text, query, windowLines, maxChunks }) => {
      checkSize(text);
      return textResult(extractText(text, query, { windowLines, maxChunks }));
    },
  );

  server.tool(
    "diet_summarize",
    "Extractive summary to a token budget. Output lines are ALWAYS verbatim from the input — this tool never invents, paraphrases, or rewrites text. Error lines and headings are kept first. With protectLines, the listed verbatim lines are kept first; if they alone exceed the budget, fail mode (default) throws instead of dropping them, and partial mode keeps them with shortfall=true for diagnostics only.",
    {
      text: z.string().describe("The text to summarize."),
      budgetTokens: z.number().int().min(10).describe("Token budget for the summary (estimated tokens)."),
      protectLines: z.array(z.string()).optional().describe("Verbatim lines that must survive (explicit list, never guessed patterns)."),
      protectMode: z.enum(["fail", "partial"]).optional().describe("Over-budget protection behavior: fail (default, throw) or partial (keep protected lines, flag shortfall)."),
    },
    async ({ text, budgetTokens, protectLines, protectMode }) => {
      checkSize(text);
      return textResult(summarizeText(text, budgetTokens, { protectLines, protectMode }));
    },
  );

  server.tool(
    "diet_pack",
    "Full pipeline: strip ANSI, dedupe, optionally extract for a query, then summarize to a token budget. Returns reduced text plus a full per-stage manifest accounting for every line.",
    {
      text: z.string().describe("The text to pack."),
      budgetTokens: z.number().int().min(10).describe("Token budget for the packed output (estimated tokens)."),
      query: z.string().optional().describe("Optional query for the extract stage."),
      windowLines: z.number().int().min(0).max(20).optional(),
      maxChunks: z.number().int().min(1).max(50).optional(),
      exactOnly: z.boolean().optional().describe("Passed to the dedupe stage: true = strict byte-identical matching only."),
      protectLines: z.array(z.string()).optional().describe("Verbatim lines that must survive the pack; the manifest reports kept vs missing, and fail mode (default) throws instead of shipping without them."),
      protectMode: z.enum(["fail", "partial"]).optional().describe("Over-budget protection behavior: fail (default, throw) or partial (diagnostics-only result with shortfall=true)."),
    },
    async ({ text, budgetTokens, query, windowLines, maxChunks, exactOnly, protectLines, protectMode }) => {
      checkSize(text);
      return textResult(packText(text, { budgetTokens, query, windowLines, maxChunks, exactOnly: exactOnly ?? false, protectLines, protectMode }));
    },
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  await runServer();
}

// Run as a stdio MCP server when executed directly (not when imported).
const invokedPath = process.argv[1] ?? "";
if (invokedPath.endsWith("server.js") || invokedPath.endsWith("server.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
