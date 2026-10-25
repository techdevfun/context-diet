import { countText, stripAnsi, type TextCounts } from "./tokens.js";
import { dedupeText } from "./dedupe.js";
import { extractText } from "./extract.js";
import { summarizeText } from "./summarize.js";

export interface StageManifest {
  stage: string;
  in: TextCounts;
  out: TextCounts;
  droppedLines: number;
  note: string;
}

export interface PackManifest {
  input: TextCounts;
  output: TextCounts;
  stages: StageManifest[];
  /** Lines dropped in total (input.lines - output.lines). */
  droppedLines: number;
  /** True when every output line appears verbatim in the input. */
  verbatim: boolean;
}

export interface PackResult {
  text: string;
  manifest: PackManifest;
}

export interface PackOptions {
  query?: string;
  budgetTokens: number;
  windowLines?: number;
  maxChunks?: number;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

/**
 * Full pipeline: strip ANSI → dedupe → (extract, if a query is given) →
 * summarize to budget. The manifest accounts for every line at every
 * stage, so a caller can verify: output.lines + droppedLines == input.lines
 * (modulo ANSI-stripped lines, which are counted in the strip stage).
 */
export function packText(rawText: string, options: PackOptions): PackResult {
  const stages: StageManifest[] = [];
  const input = countText(rawText);

  const stripped = stripAnsi(rawText);
  const strippedCounts = countText(stripped);
  stages.push({
    stage: "strip-ansi",
    in: input,
    out: strippedCounts,
    droppedLines: input.lines - strippedCounts.lines,
    note: "ANSI escape sequences removed; line counts rarely change here.",
  });

  const deduped = dedupeText(stripped);
  const dedupedCounts = countText(deduped.text);
  stages.push({
    stage: "dedupe",
    in: strippedCounts,
    out: dedupedCounts,
    droppedLines:
      deduped.removedDuplicateLines + deduped.removedBlockLines,
    note: `${plural(deduped.removedDuplicateLines, "duplicate line")}, ${plural(deduped.removedDuplicateBlocks, "duplicate block")} (${plural(deduped.removedBlockLines, "line")}) removed.`,
  });

  let currentText = deduped.text;
  let currentCounts = dedupedCounts;
  if (options.query && options.query.trim() !== "") {
    const extracted = extractText(currentText, options.query, {
      windowLines: options.windowLines ?? 2,
      maxChunks: options.maxChunks ?? 10,
    });
    const extractedCounts = countText(extracted.text);
    stages.push({
      stage: "extract",
      in: currentCounts,
      out: extractedCounts,
      droppedLines: currentCounts.lines - extractedCounts.lines,
      note: `${plural(extracted.chunks.length, "chunk")} kept for query "${options.query}".`,
    });
    currentText = extracted.text;
    currentCounts = extractedCounts;
  }

  const summarized = summarizeText(currentText, options.budgetTokens);
  const summarizedCounts = countText(summarized.text);
  stages.push({
    stage: "summarize",
    in: currentCounts,
    out: summarizedCounts,
    droppedLines:
      summarized.droppedNoiseLines + summarized.droppedOverBudgetLines,
    note: `${plural(summarized.droppedNoiseLines, "noise line")}, ${plural(summarized.droppedOverBudgetLines, "over-budget line")} dropped.`,
  });

  const output = summarizedCounts;
  const inputLines = new Set(stripped.split("\n"));
  const outputLines = summarized.text === "" ? [] : summarized.text.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const verbatim = outputLines.every((l) => inputLines.has(l));

  return {
    text: summarized.text,
    manifest: {
      input,
      output,
      stages,
      droppedLines: input.lines - output.lines,
      verbatim,
    },
  };
}
