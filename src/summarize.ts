import { splitLines, estimateTokens } from "./tokens.js";

export interface SummarizeResult {
  text: string;
  keptLines: number;
  droppedNoiseLines: number;
  droppedOverBudgetLines: number;
  /** Protected candidate lines kept in the output (line count). */
  protectedKept: number;
  /** Protected strings with no matching candidate line in the input. */
  protectedMissing: string[];
  /** True when the protected lines alone exceed the token budget. */
  protectedOverBudget: boolean;
  /**
   * True when the output is NOT a within-budget summary: protected
   * content exceeded the budget (partial mode only; fail mode throws
   * instead). A shortfall result is for diagnostics, never a claim of
   * successful compression.
   */
  shortfall: boolean;
}

export interface SummarizeOptions {
  /**
   * Verbatim lines that must survive summarization. Protection is an
   * explicit caller-supplied list, never a guessed pattern: a line is
   * protected exactly when it equals one of these strings. Noise lines
   * (blank, timestamp-only, decoration) are never candidates, so a
   * protected string matching only noise is reported missing.
   */
  protectLines?: string[];
  /**
   * What to do when the protected lines alone exceed the budget.
   * "fail" (default): throw instead of dropping protected content.
   * "partial": keep all protected lines anyway (output may exceed the
   * budget) and set shortfall=true for diagnostics.
   */
  protectMode?: "fail" | "partial";
}

const ERROR_RE = /(error|fail(?:ure|ed)?|exception|traceback|assert|fatal|panic)/i;
const HEADING_RE = /^\s{0,3}#{1,6}\s+\S/;
const NOISE_RE =
  /^\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)\s*$/;
const DECORATION_RE = /^[\s│┃─━═✳✗✓✔·\-_=*#~]+$/;

function isNoise(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  if (NOISE_RE.test(trimmed)) return true;
  if (DECORATION_RE.test(trimmed)) return true;
  return false;
}

/**
 * Extractive summary to a token budget. CORE SAFETY PROPERTY: every output
 * line is copied verbatim from the input — this function never invents,
 * paraphrases, or rewrites text.
 *
 * Priority order (never dropped while budget allows):
 *   0. caller-protected lines (exact verbatim match, see SummarizeOptions);
 *   1. error/failure lines and headings;
 *   2. first and last lines of each blank-line-separated paragraph;
 *   3. remaining lines in document order until the budget is met.
 * Noise lines (blank, timestamp-only, pure decoration) are always dropped
 * and counted separately. Over-budget drops come from the middle first so
 * the beginning and end of the document survive.
 */
export function summarizeText(
  text: string,
  budgetTokens: number,
  options: SummarizeOptions = {},
): SummarizeResult {
  const lines = splitLines(text);
  const protectMode = options.protectMode ?? "fail";
  const protectedSet = new Set(options.protectLines ?? []);
  let droppedNoiseLines = 0;
  const candidates: { line: string; index: number; priority: number }[] = [];
  lines.forEach((line, index) => {
    if (isNoise(line)) {
      droppedNoiseLines++;
      return;
    }
    let priority = 3;
    if (ERROR_RE.test(line) || HEADING_RE.test(line)) priority = 1;
    if (protectedSet.has(line)) priority = 0;
    candidates.push({ line, index, priority });
  });

  // Protected accounting, computed before selection.
  const protectedCandidates = candidates.filter((c) => c.priority === 0);
  const protectedTokens = protectedCandidates.reduce(
    (sum, c) => sum + estimateTokens(c.line + "\n"),
    0,
  );
  const protectedOverBudget = protectedTokens > budgetTokens;
  const foundProtected = new Set(protectedCandidates.map((c) => c.line));
  const protectedMissing = [...protectedSet].filter((s) => !foundProtected.has(s));
  if (protectedOverBudget && protectMode === "fail") {
    throw new Error(
      `Protected lines need ~${protectedTokens} estimated tokens, exceeding the ${budgetTokens} budget; ` +
        `refusing to drop protected content. Raise the budget, split the input, or use protectMode "partial" for a diagnostics-only result.`,
    );
  }

  // First/last lines of each maximal run of consecutive original indices
  // get priority 2 (unless already priority 1). Blank lines are noise, so
  // runs are defined over the surviving candidates' original indices.
  const byIndex = new Map(candidates.map((c) => [c.index, c]));
  const sortedIdx = [...byIndex.keys()].sort((a, b) => a - b);
  let run: number[] = [];
  const flushRun = () => {
    if (run.length >= 4) {
      const first = byIndex.get(run[0])!;
      const last = byIndex.get(run[run.length - 1])!;
      if (first.priority > 2) first.priority = 2;
      if (last.priority > 2) last.priority = 2;
    }
    run = [];
  };
  let prev = -2;
  for (const idx of sortedIdx) {
    if (idx !== prev + 1) flushRun();
    run.push(idx);
    prev = idx;
  }
  flushRun();

  // Select by priority, then document order, until the budget is met.
  // Protected lines (priority 0) bypass the budget check: in fail mode
  // an over-budget protected set already threw above, and in partial
  // mode they are kept anyway with shortfall=true.
  const ordered = [...candidates].sort(
    (a, b) => a.priority - b.priority || a.index - b.index,
  );
  const selected = new Set<number>();
  let usedTokens = 0;
  for (const c of ordered) {
    const cost = estimateTokens(c.line + "\n");
    if (c.priority !== 0 && selected.size > 0 && usedTokens + cost > budgetTokens) continue;
    selected.add(c.index);
    usedTokens += cost;
  }
  // Always keep at least the first candidate even if it exceeds budget.
  if (selected.size === 0 && candidates.length > 0) {
    selected.add(candidates[0].index);
  }
  const kept = candidates
    .filter((c) => selected.has(c.index))
    .sort((a, b) => a.index - b.index);
  const droppedOverBudgetLines = candidates.length - kept.length;
  const out = kept.map((c) => c.line);
  return {
    text: out.join("\n") + (out.length > 0 ? "\n" : ""),
    keptLines: out.length,
    droppedNoiseLines,
    droppedOverBudgetLines,
    protectedKept: kept.filter((c) => c.priority === 0).length,
    protectedMissing,
    protectedOverBudget,
    shortfall: protectedOverBudget,
  };
}
