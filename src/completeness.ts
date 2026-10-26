import { splitLines } from "./tokens.js";

export interface CompletenessItem {
  /** The planned item string, verbatim as supplied by the caller. */
  item: string;
  /** True when some output line contains the item verbatim. */
  found: boolean;
  /** The first output line containing the item, when found. */
  evidence?: string;
}

export interface CompletenessResult {
  /** Distinct planned items checked (blank planned strings ignored). */
  plannedCount: number;
  /** Planned items found in the output. */
  foundCount: number;
  /** Planned items absent from the output. */
  missingCount: number;
  /** True when every planned item was found. */
  survived: boolean;
  /** Planned items absent from the output, in planned order. */
  missing: string[];
  /** Per-item results in planned order, with evidence lines for found items. */
  items: CompletenessItem[];
}

/**
 * Planned-vs-executed completeness check: a ledger, not a re-run.
 *
 * The caller supplies the plan (what was supposed to appear, e.g. test
 * names from a runner's plan) and the output to verify (possibly
 * already trimmed). Each planned item is FOUND when some output line
 * contains it verbatim as a substring, case-sensitive. Substring
 * matching (rather than whole-line equality) is deliberate: real
 * output lines embed item names with status and timing decorations
 * ("PASS src/api/users.test.js (12ms)"). Its boundary is documented,
 * not hidden: short identifiers can false-positive ("test-1" inside
 * "test-12"), so callers should use specific identifiers, and every
 * found item carries its evidence line so an auditor can see exactly
 * what matched.
 *
 * This check is one-directional by design: it verifies planned items
 * appear in the output. It does NOT detect executed-but-unplanned
 * items, because the tool cannot know what "looks like an item"
 * without guessing a pattern.
 *
 * The result itself is the durable sidecar record: it must be kept
 * OUTSIDE the trimmed artifact (stdout JSON, CI log), never appended
 * inside the trimmed text — a flag inside the trimmed artifact is a
 * fire alarm in the burning room. The loud channel is separate: the
 * CLI exits non-zero when the check fails, so CI goes red exactly
 * when a sentinel did not survive. Quiet when OK, loud when broken.
 */
export function checkCompleteness(text: string, planned: string[]): CompletenessResult {
  const lines = splitLines(text);
  // Blank planned strings would match every line; they carry no
  // meaning and are ignored. Duplicates are checked once.
  const distinctPlanned = [...new Set(planned.filter((s) => s !== ""))];
  const items: CompletenessItem[] = distinctPlanned.map((item) => {
    const evidence = lines.find((line) => line.includes(item));
    return evidence === undefined
      ? { item, found: false }
      : { item, found: true, evidence };
  });
  const missing = items.filter((i) => !i.found).map((i) => i.item);
  return {
    plannedCount: items.length,
    foundCount: items.length - missing.length,
    missingCount: missing.length,
    survived: missing.length === 0,
    missing,
    items,
  };
}
