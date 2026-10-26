# Changelog

## 0.5.0 — 2026-10-26

Marker mode for the completeness check (from dev.to reader
feedback: a log reciting the plan scored 5/5, survived, exit 0
without executing anything).

- `diet_check` / CLI `check` accept `markers` (`--markers` file):
  a non-empty list enables marker mode, in which a line counts as
  execution evidence only when it contains the item verbatim AND
  carries a marker on word boundaries (PASS matches "PASS t1" but
  not "BYPASS t1"). Among the lines containing an item, the first
  marked line decides: a fail marker on it means executed-fail,
  otherwise executed-pass; an item with no marked containing line
  is missing, even if unmarked lines recite it.
- Buckets replace the scalar: executed-pass / executed-fail /
  missing / caller-declared skip, with `survived` requiring nothing
  missing and nothing failed in marker mode. Fail markers default
  to `["FAIL"]` unless the caller overrides (including [] to
  disable); fail markers without markers are an error.
- Caller-declared skips (`skipped` / `--skipped` file) are plan
  changes, not executions: trusted, listed by name, carrying no
  evidence, never counted as missing. The check does not verify
  skips against the output and does not claim to.
- Deliberate boundaries: one-directional only; marked evidence is
  text presence, not proof against a log that echoes markers —
  keep the plan and the output in separate channels and audit
  evidence lines; an earlier FAIL is not erased by a later PASS.
  Plain mode (no markers) is unchanged.
- Measured via CLI: echo fixture (5 plan lines, no markers) →
  0 executed-pass, 5 missing, exit 1; mixed run (2 PASS, 1 FAIL,
  1 declared skip, 1 absent) → 2 executed-pass, 1 executed-fail,
  1 skipped, 1 missing, exit 1; clean run (2 PASS, 1 declared
  skip) → survived, exit 0. Suite 52/52 green.

## 0.4.0 — 2026-10-26

Planned-vs-executed completeness check (from dev.to reader feedback:
a plan at the start and a smaller executed count at the end should
make the skipped middle audible).

- New tool `diet_check` (MCP) + CLI `check`: verify every planned
  item appears in an output, possibly already trimmed, without
  re-running anything. Each item is found when some output line
  contains it verbatim as a substring (case-sensitive); every found
  item carries its evidence line, missing items are listed by name,
  and `survived` is true exactly when nothing is missing.
- Two channels, as designed in the thread: the JSON result is the
  durable sidecar record (quiet, diffable, kept outside the trimmed
  artifact); the CLI exits non-zero when the check fails, so CI goes
  red exactly when a sentinel did not survive. Quiet when OK, loud
  when broken.
- Deliberate boundaries: one-directional only (no
  executed-but-unplanned detection without guessing a pattern);
  substring matching can false-positive on short identifiers, so
  callers should use specific identifiers and audit the evidence
  lines.
- Measured via CLI: 10 planned items against an 8-item output →
  INCOMPLETE (8/10 found; missing t8, t9 by name), exit 1 with a
  one-line stderr summary; the complete case reports COMPLETE (10/10)
  with exit 0.

## 0.3.0 — 2026-10-26

Protected lines / must-keep lines (from dev.to reader feedback: small
details that change an approved decision must not be summarized away).

- `diet_summarize` and `diet_pack` accept `protectLines`: verbatim
  lines that must survive, supplied explicitly by the caller — never a
  guessed pattern. Protected lines are kept first, ahead of error lines.
- If protected lines alone exceed the budget, fail mode (default)
  throws instead of dropping them; partial mode keeps them and flags
  `shortfall` for diagnostics only, never as a successful compression.
- The pack manifest reports protected kept vs missing, and the pack
  end-check refuses to ship when an earlier stage (notably extract)
  dropped a protected line.
- Deliberate boundary: this tool does not detect semantic
  contradictions between protected requirements (it matches text, it
  does not understand meaning). The over-budget/missing report, naming
  every protected line at stake, is the conflict report.
- Measured via CLI: a requirement line mid-section is dropped at
  budget 25 without protection (2 lines kept) but kept with protection
  (protectedKept 1, shortfall false); protection needing ~11 estimated
  tokens against a 10 budget throws in fail mode and flags shortfall in
  partial mode.

## 0.2.0 — 2026-10-26

Near-duplicate dedupe (from dev.to reader feedback: repeated stack
traces differing only by memory address).

- `diet_dedupe` / `dedupe` stage now also collapse lines and blocks
  that differ only in `0x`-prefixed memory addresses. The first
  occurrence is always kept verbatim with its location; later
  near-duplicate locations are counted in the manifest, not kept.
- Near-duplicate removals are counted separately from exact ones
  (`removedNearDuplicateLines/Blocks`), so the manifest never conflates
  the two. Pack manifest arithmetic (output + dropped == input) still
  holds.
- Deliberate boundaries: bare hex without a `0x` prefix, timestamps,
  and PIDs stay exact. Normalized-text equality is an approximation,
  not proof that two failures share a fix.
- Opt-out: `--exact-only` (CLI) or `exactOnly` (MCP) restores strict
  byte-identical matching.
- Measured on a 12-line fixture (3 copies of one 4-line trace with
  different addresses): before, exact-only dedupe kept 10 lines; now it
  keeps the first 4 lines verbatim and counts 1 near-duplicate block
  (8 lines, longest-first). The published demo numbers are unchanged: the demo log
  contains no `0x` addresses.

## 0.1.0 — 2026-10-25

Initial release (phase 1).

- MCP server (stdio) with 5 tools: `diet_count`, `diet_dedupe`,
  `diet_extract`, `diet_summarize`, `diet_pack`.
- CLI `context-diet` (stdin/file, `--root` confinement, `serve` mode).
- Deterministic, extractive reduction: output lines are always verbatim
  input lines; every drop is counted in a per-stage manifest.
- Token counts are documented estimates (chars/4 rule); lines and bytes
  are exact.
