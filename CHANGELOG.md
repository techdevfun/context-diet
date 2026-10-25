# Changelog

## 0.1.0 — 2026-10-25

Initial release (phase 1).

- MCP server (stdio) with 5 tools: `diet_count`, `diet_dedupe`,
  `diet_extract`, `diet_summarize`, `diet_pack`.
- CLI `context-diet` (stdin/file, `--root` confinement, `serve` mode).
- Deterministic, extractive reduction: output lines are always verbatim
  input lines; every drop is counted in a per-stage manifest.
- Token counts are documented estimates (chars/4 rule); lines and bytes
  are exact.
