# Context Diet

**A deterministic diet for agent context — every cut accounted for,
nothing invented.**

Coding agents do not run out of context because of one big file. They
run out because of accumulation: tool outputs, test logs, build logs,
repeated turns, and the same content pasted again in a new form.
Context Diet shrinks that accumulated content before it reaches the
model — and proves every cut with a manifest.

![Demo: packing a real session log](docs/demo/demo.gif)

## How it works

Context Diet is an MCP server (plus a CLI) with five tools:

| Tool | What it does |
|---|---|
| `diet_count` | Lines, bytes, and estimated tokens of a text |
| `diet_dedupe` | Removes duplicate lines and repeated blocks (traces differing only in 0x addresses collapse too, first occurrence kept verbatim) |
| `diet_extract` | Relevance-ranked excerpts for a query |
| `diet_summarize` | Extractive summary to a token budget |
| `diet_pack` | Full pipeline + a manifest for every line |

Near-duplicates: repeated stack traces that differ only in `0x` memory
addresses collapse to their first occurrence, which is kept verbatim with
its location; later locations are counted (not kept) and reported
separately from exact duplicates in the manifest. Bare hex without a
`0x` prefix, timestamps, and PIDs are left exact, because they may be
meaningful identifiers. This is text matching, not proof that two
failures share a fix. Pass `--exact-only` (CLI) or `exactOnly` (MCP)
for strict byte-identical matching.

Protected lines: pass verbatim lines that must survive (`protectLines`
in `diet_summarize`/`diet_pack`, `--protect-file` in the CLI). They
are kept first, ahead of error lines. If they alone exceed the budget,
fail mode (default) throws instead of dropping them; partial mode
keeps them and flags `shortfall` for diagnostics only. The pack
manifest reports protected kept vs missing. Protection is an explicit
caller list, never a guessed pattern, and this tool does not detect
semantic contradictions between requirements: the over-budget/missing
report, naming every protected line at stake, is the conflict report —
it never silently chooses which requirement to drop.

The core promise is negative and checkable: **output lines are always
copied verbatim from the input.** Context Diet never invents,
paraphrases, or rewrites text. If a detail matters, it is either in the
output or counted in the manifest — never silently rewritten.

## Measured on a real session log

`examples/session.log` (169 lines of real command outputs: verbose test
runs, a README excerpt, a build output) packed to a 400-token
budget with the query `test failure`:

| | Lines | Bytes | Est. tokens |
|---|---|---|---|
| Before | 169 | 7,917 | 1,942 |
| After | 23 | 1,587 | 392 |
| Saved | 86.4% | 80.0% | 79.8% |

Manifest: dedupe −54 lines, extract −4, summarize −88. Verbatim: true.
Token counts are estimates (documented chars/4 rule); lines and bytes
are exact.

## Try it in 3 steps

```bash
git clone https://github.com/techdevfun/context-diet
cd context-diet
npm install && npm run build
# as a CLI:
node dist/cli.js pack --input examples/session.log --budget 400 --query "test failure"
# as an MCP server (Claude Code, Cursor, any MCP client) over stdio:
#   command: node, args: ["<path>/context-diet/dist/server.js"]
```

## MCP configuration

```json
{
  "mcpServers": {
    "context-diet": {
      "command": "node",
      "args": ["/path/to/context-diet/dist/server.js"]
    }
  }
}
```

(An npm package install, `npm install -g context-diet`, arrives with the
first npm publish — see Roadmap.)

## Examples

```bash
# How big is this log, really?
node dist/cli.js count --input ci.log

# Just the failures and their surroundings:
node dist/cli.js extract --input ci.log --query "timeout database"

# Fit it into 300 tokens, with receipts:
node dist/cli.js pack --input ci.log --budget 300
```

## What it is not

- Not an LLM summarizer: v1 never rewrites text. If you need true
  abstractive summarization, this tool will not do it.
- Not a code minifier: code is treated as text (no AST transforms).
- Not a memory store: each call is stateless. (Our sibling project
  memgraph stores decisions across sessions; Context Diet removes
  redundancy within a session. Different products, opposite directions.)
- Token numbers are estimates (chars/4 rule). Lines and bytes are exact.

## Safety

- File inputs are confined to `--root` (default: working directory).
- No network, no shell execution, no model calls.
- Input/output size caps with clear errors.
- Do not pipe secrets you would not show the model anyway: the tool
  passes text through, and a summary goes to the same audience that
  could already see the log. Redaction is on the roadmap.

## Roadmap (not in v1)

LLM summarization (opt-in), model-based compression, AST-aware code
minification, cross-session cache, dashboard, auto-apply to agent
configs, JUnit/XML parsing, SARIF output, secret redaction.

## License

MIT. See LICENSE.
