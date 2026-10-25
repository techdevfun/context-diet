#!/bin/bash
# Demo: pack a real session log (examples/session.log) with Context Diet.
# The log is composed of real command outputs produced on this machine:
# verbose test runs (twice, as agents re-run), a real README excerpt,
# and a real build output. Nothing in it is hand-written filler.
set -e
cd "$(dirname "$0")/.."
echo "=== BEFORE (diet_count) ==="
node dist/cli.js count --input examples/session.log --root .
echo
echo "=== AFTER (diet_pack, budget 400 est. tokens, query 'test failure') ==="
node dist/cli.js pack --input examples/session.log --root . --budget 400 --query "test failure" --text
echo
echo "=== MANIFEST (same run, JSON) ==="
node dist/cli.js pack --input examples/session.log --root . --budget 400 --query "test failure" \
  | python3 -c "import json,sys; m=json.load(sys.stdin)['manifest']; print('input :', m['input']); print('output:', m['output']); print('verbatim:', m['verbatim']); [print(f\"  {s['stage']:12s} dropped {s['droppedLines']:3d} lines — {s['note']}\") for s in m['stages']]"
