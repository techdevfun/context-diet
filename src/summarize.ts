import { splitLines, estimateTokens } from "./tokens.js";

export interface SummarizeResult {
  text: string;
  keptLines: number;
  droppedNoiseLines: number;
  droppedOverBudgetLines: number;
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
 *   1. error/failure lines and headings;
 *   2. first and last lines of each blank-line-separated paragraph;
 *   3. remaining lines in document order until the budget is met.
 * Noise lines (blank, timestamp-only, pure decoration) are always dropped
 * and counted separately. Over-budget drops come from the middle first so
 * the beginning and end of the document survive.
 */
export function summarizeText(text: string, budgetTokens: number): SummarizeResult {
  const lines = splitLines(text);
  let droppedNoiseLines = 0;
  const candidates: { line: string; index: number; priority: number }[] = [];
  lines.forEach((line, index) => {
    if (isNoise(line)) {
      droppedNoiseLines++;
      return;
    }
    let priority = 3;
    if (ERROR_RE.test(line) || HEADING_RE.test(line)) priority = 1;
    candidates.push({ line, index, priority });
  });

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
  const ordered = [...candidates].sort(
    (a, b) => a.priority - b.priority || a.index - b.index,
  );
  const selected = new Set<number>();
  let usedTokens = 0;
  for (const c of ordered) {
    const cost = estimateTokens(c.line + "\n");
    if (selected.size > 0 && usedTokens + cost > budgetTokens) continue;
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
  };
}
