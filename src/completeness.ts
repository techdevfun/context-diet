import { splitLines } from "./tokens.js";

export type CompletenessStatus =
  | "found"
  | "missing"
  | "executed-pass"
  | "executed-fail"
  | "skipped";

export interface CompletenessItem {
  /** The planned item string, verbatim as supplied by the caller. */
  item: string;
  /** True when the item has evidence (found, executed-pass, executed-fail). */
  found: boolean;
  /** Bucket verdict for the item (see checkCompleteness). */
  status: CompletenessStatus;
  /** The evidence line, when one was found. Skipped items carry none. */
  evidence?: string;
}

export interface CompletenessOptions {
  /**
   * Execution markers, caller-supplied (e.g. ["PASS", "FAIL", "[run]"]).
   * A non-empty list enables marker mode. Blank strings are ignored.
   */
  markers?: string[];
  /**
   * Markers meaning failure. Only meaningful with markers; passing
   * failMarkers without markers throws. When marker mode is on and
   * failMarkers is undefined, ["FAIL"] is the default; pass [] to
   * disable the default. Nothing else is guessed: no other marker
   * is treated as failure unless the caller says so.
   */
  failMarkers?: string[];
  /**
   * Caller-declared skips (plan changes, not executions). A skipped
   * item is listed by name, carries no evidence, and never counts as
   * missing. The check trusts the declaration (see below) — it does
   * not verify skips against the output.
   */
  skipped?: string[];
}

export interface CompletenessResult {
  /** Distinct planned items in the ledger (skipped items included). */
  plannedCount: number;
  /** Planned items with evidence (found, executed-pass, executed-fail). */
  foundCount: number;
  /** Planned items absent from the output (marker mode: no marked evidence). */
  missingCount: number;
  /** True when nothing is missing and (in marker mode) nothing failed. */
  survived: boolean;
  /** Planned items absent from the output, in planned order. */
  missing: string[];
  /** Per-item results in planned order, with evidence lines for found items. */
  items: CompletenessItem[];
  /** Items with marked evidence and no fail marker (marker mode only). */
  executedPassCount: number;
  /** Items whose deciding marked line carries a fail marker. */
  executedFailCount: number;
  /** Caller-declared skips, in planned order. */
  skippedCount: number;
  /** Caller-declared skips, by name. */
  skipped: string[];
}

/**
 * A marker matches a line only on word boundaries: the character
 * before and after the marker must not be an alphanumeric or
 * underscore, or the marker must sit at a line edge. Position is
 * anywhere in the line; the token is what must be whole. So PASS
 * matches "PASS t1" and "[run:t1] PASS" but not "BYPASS t1".
 * Deterministic character rule, no guessing, no model.
 */
function carriesMarker(line: string, marker: string): boolean {
  if (marker === "") return false;
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let from = 0;
  for (;;) {
    const idx = line.indexOf(marker, from);
    if (idx === -1) return false;
    const before = idx === 0 ? "" : line[idx - 1];
    const after = idx + marker.length >= line.length ? "" : line[idx + marker.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = idx + 1;
  }
}

/**
 * Planned-vs-executed completeness check: a ledger, not a re-run.
 *
 * Plain mode (no markers): each planned item is FOUND when some
 * output line contains it verbatim as a substring, case-sensitive.
 * Substring matching (rather than whole-line equality) is deliberate:
 * real output lines embed item names with status and timing
 * decorations ("PASS src/api/users.test.js (12ms)"). Its boundary is
 * documented, not hidden: short identifiers can false-positive
 * ("test-1" inside "test-12"), so callers should use specific
 * identifiers, and every found item carries its evidence line so an
 * auditor can see exactly what matched.
 *
 * Marker mode (markers supplied): an output line is execution
 * evidence for an item only when it contains the item verbatim AND
 * carries a marker on word boundaries. Among the lines containing
 * the item, the first MARKED line decides: a fail marker on it means
 * executed-fail, otherwise executed-pass. A line carrying both a
 * pass and a fail marker counts as executed-fail — a recorded
 * failure is not erased by sharing a line with a pass. An item with
 * no marked containing line is missing, even if unmarked lines
 * recite it: that is what kills the echo fixture, where a log that
 * recites all five plan lines and executes nothing scores 0
 * executed-pass, 5 missing. An earlier FAIL is not erased by a
 * later PASS either — the first marked line decides, and the
 * evidence line attached shows why.
 *
 * Caller-declared skips: an item in `skipped` is a plan change, not
 * an execution, so the check TRUSTS the declaration — it does not
 * verify skips against the output, because there is nothing in the
 * output a skip claim could be verified against. The skipped list
 * is printed by name in the result, so the auditor sees exactly
 * what was excluded. A skipped item carries no evidence and never
 * counts as missing or failed.
 *
 * Channel limit, stated plainly: the check counts marked lines as
 * execution evidence; it cannot tell a genuine runner PASS line
 * from a plan line that echoes a marker. Naming the item is enough
 * for the check — provenance is not something text presence can
 * prove. The mitigation is deployment, not detection: keep the plan
 * and the output in separate channels (the runner writes the
 * markers; the plan is a separate input) and audit evidence lines.
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
export function checkCompleteness(
  text: string,
  planned: string[],
  options: CompletenessOptions = {},
): CompletenessResult {
  const lines = splitLines(text);
  // Blank planned strings would match every line; they carry no
  // meaning and are ignored. Duplicates are checked once.
  const distinctPlanned = [...new Set(planned.filter((s) => s !== ""))];
  const skippedSet = new Set((options.skipped ?? []).filter((s) => s !== ""));
  const markers = [...new Set((options.markers ?? []).filter((s) => s !== ""))];
  const markerMode = markers.length > 0;
  const givenFailMarkers = (options.failMarkers ?? []).filter((s) => s !== "");
  if (!markerMode && givenFailMarkers.length > 0) {
    throw new Error("failMarkers requires markers: pass execution markers to enable marker mode.");
  }
  // One documented default, nothing else guessed: FAIL means failure
  // unless the caller overrides (including [] to disable).
  const failMarkers =
    markerMode && options.failMarkers === undefined
      ? ["FAIL"]
      : [...new Set(givenFailMarkers)];

  const items: CompletenessItem[] = distinctPlanned.map((item) => {
    if (skippedSet.has(item)) {
      return { item, found: false, status: "skipped" as const };
    }
    const containing = lines.filter((line) => line.includes(item));
    if (containing.length === 0) {
      return { item, found: false, status: "missing" as const };
    }
    if (!markerMode) {
      return { item, found: true, status: "found" as const, evidence: containing[0] };
    }
    const deciding = containing.find((line) =>
      markers.some((m) => carriesMarker(line, m)),
    );
    if (deciding === undefined) {
      return { item, found: false, status: "missing" as const };
    }
    if (failMarkers.some((m) => carriesMarker(deciding, m))) {
      return { item, found: true, status: "executed-fail" as const, evidence: deciding };
    }
    return { item, found: true, status: "executed-pass" as const, evidence: deciding };
  });

  const missing = items.filter((i) => i.status === "missing").map((i) => i.item);
  const skipped = items.filter((i) => i.status === "skipped").map((i) => i.item);
  const executedPassCount = items.filter((i) => i.status === "executed-pass").length;
  const executedFailCount = items.filter((i) => i.status === "executed-fail").length;
  const foundCount = items.filter((i) => i.found).length;
  return {
    plannedCount: items.length,
    foundCount,
    missingCount: missing.length,
    survived: markerMode
      ? missing.length === 0 && executedFailCount === 0
      : missing.length === 0,
    missing,
    items,
    executedPassCount,
    executedFailCount,
    skippedCount: skipped.length,
    skipped,
  };
}
