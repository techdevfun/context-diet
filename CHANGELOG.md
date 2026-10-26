# Changelog

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
