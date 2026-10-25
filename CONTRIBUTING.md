# Contributing to Context Diet

## Development

```bash
npm install
npm run build
npm test
```

Tests run on the compiled `dist/` output with an explicit file list
(`node --test` glob patterns need Node 21+; the matrix includes 20.x).

## Rules for new reduction logic

1. **Never invent text.** Any new summarizer must output only lines
   copied verbatim from the input, and its drops must be counted in the
   manifest. A feature that rewrites content needs a separate,
   explicitly opt-in tool — never a silent change to `diet_pack`.
2. **Manifest arithmetic must hold.** After any pipeline change,
   `output.lines + droppedLines == input.lines` on the pack test
   fixtures. If it does not hold, the change is wrong.
3. **Token counts stay labeled estimates.** The chars/4 rule is a rule
   of thumb. Do not present estimated tokens as measured values.
4. **No new runtime dependencies without a reason** recorded in the PR.
   The reduction logic itself is dependency-free; only the MCP SDK is
   allowed as a runtime dependency.

## Pull requests

Small, tested, documented. Include a fixture that fails before your
change and passes after it.
