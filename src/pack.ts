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
  /**
   * Present only when protectLines were supplied. "kept" counts distinct
   * protected strings present as output lines; "missing" lists protected
   * strings absent from the final output (dropped by an earlier stage
   * such as extract, or never present in the input). "shortfall" is true
   * when the output is not a within-budget summary holding all protected
   * content. This tool does not detect semantic contradictions between
   * protected requirements: the over-budget/missing report, naming every
   * protected string at stake, is the conflict report — it never
   * silently chooses which requirement to drop.
   */
  protected?: {
    kept: number;
    missing: string[];
    overBudget: boolean;
    shortfall: boolean;
  };
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
  /** Passed to the dedupe stage: true = strict byte-identical matching only. */
  exactOnly?: boolean;
  /** Verbatim lines that must survive the pack (see SummarizeOptions). */
  protectLines?: string[];
  /** Passed to the summarize stage ("fail" default, "partial"). */
  protectMode?: "fail" | "partial";
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

  const deduped = dedupeText(stripped, { exactOnly: options.exactOnly ?? false });
  const dedupedCounts = countText(deduped.text);
  const dedupeNoteParts = [
    `${plural(deduped.removedDuplicateLines, "duplicate line")}, ${plural(deduped.removedDuplicateBlocks, "duplicate block")} (${plural(deduped.removedBlockLines, "line")}) removed.`,
  ];
  if (deduped.removedNearDuplicateLines > 0 || deduped.removedNearDuplicateBlocks > 0) {
    dedupeNoteParts.push(
      `${plural(deduped.removedNearDuplicateLines, "near-duplicate line")} (0x addresses only), ${plural(deduped.removedNearDuplicateBlocks, "near-duplicate block")} (${plural(deduped.removedNearBlockLines, "line")}) removed.`,
    );
  }
  stages.push({
    stage: "dedupe",
    in: strippedCounts,
    out: dedupedCounts,
    droppedLines:
      deduped.removedDuplicateLines + deduped.removedBlockLines +
      deduped.removedNearDuplicateLines + deduped.removedNearBlockLines,
    note: dedupeNoteParts.join(" "),
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

  const summarized = summarizeText(currentText, options.budgetTokens, {
    protectLines: options.protectLines,
    protectMode: options.protectMode,
  });
  const summarizedCounts = countText(summarized.text);
  const summarizeNoteParts = [
    `${plural(summarized.droppedNoiseLines, "noise line")}, ${plural(summarized.droppedOverBudgetLines, "over-budget line")} dropped.`,
  ];
  if (options.protectLines && options.protectLines.length > 0) {
    summarizeNoteParts.push(
      `${plural(summarized.protectedKept, "protected line")} kept, ${plural(summarized.protectedMissing.length, "protected line")} missing.` +
        (summarized.shortfall ? " SHORTFALL: protected content exceeded the budget (diagnostics only)." : ""),
    );
  }
  stages.push({
    stage: "summarize",
    in: currentCounts,
    out: summarizedCounts,
    droppedLines:
      summarized.droppedNoiseLines + summarized.droppedOverBudgetLines,
    note: summarizeNoteParts.join(" "),
  });

  const output = summarizedCounts;
  const inputLines = new Set(stripped.split("\n"));
  const outputLines = summarized.text === "" ? [] : summarized.text.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const verbatim = outputLines.every((l) => inputLines.has(l));

  // End-check for protection: every protected string must appear as a
  // line in the final output, whatever earlier stages did. The summarize
  // stage already fails on over-budget protection in fail mode; this
  // check catches protection lost earlier (notably by extract, which
  // keeps only query chunks). It never silently ships without them.
  let protectedSection: PackManifest["protected"];
  if (options.protectLines && options.protectLines.length > 0) {
    const outputSet = new Set(outputLines);
    const distinctProtected = [...new Set(options.protectLines)];
    const missing = distinctProtected.filter((s) => !outputSet.has(s));
    const shortfall = summarized.shortfall || missing.length > 0;
    if (missing.length > 0 && (options.protectMode ?? "fail") === "fail") {
      throw new Error(
        `Protected content lost before the final output (${missing.length} line(s) missing: ${missing.map((s) => JSON.stringify(s)).join(", ")}). ` +
          `Refusing to ship a pack without protected content; raise the budget, narrow the query, or use protectMode "partial" for a diagnostics-only result.`,
      );
    }
    protectedSection = {
      kept: distinctProtected.length - missing.length,
      missing,
      overBudget: summarized.protectedOverBudget,
      shortfall,
    };
  }

  return {
    text: summarized.text,
    manifest: {
      input,
      output,
      stages,
      droppedLines: input.lines - output.lines,
      verbatim,
      ...(protectedSection ? { protected: protectedSection } : {}),
    },
  };
}
