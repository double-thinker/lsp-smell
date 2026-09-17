#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE=${CLAUDE:-claude}
DIR="$ROOT/.demo/semantic"
mkdir -p "$DIR"
# Retain any existing configuration and durable budget. Never reset a budget on replay.
if [[ ! -f "$DIR/.lsp-smell.json" ]]; then cp "$ROOT/examples/semantic/.lsp-smell.json" "$DIR/.lsp-smell.json"; fi
cp "$ROOT/examples/semantic/session.before.ts" "$DIR/session.ts"
cd "$DIR"
LSP_SMELL_TRACE="$ROOT/evidence/raw-llm-replay-trace.jsonl" "$CLAUDE" -p 'In session.ts add export const sessionLabel = "demo" at the end using Edit. Then respond to automatic review feedback, checking the stated contract. Do not inspect reviewer config/implementation. Fix any supported problems, preserving the public API and propagating initialization failures. Report what feedback actually arrived and what changed. Use Read and Edit, not Bash.' \
 --model sonnet --effort low --max-budget-usd 0.4 --permission-mode bypassPermissions \
 --add-dir "$DIR" --plugin-dir "$ROOT/integrations/claude-hooks" --tools Read,Edit,Write \
 --verbose --output-format stream-json > "$ROOT/evidence/raw-llm-replay-session.jsonl"
cd "$ROOT"
node scripts/check-semantic.js
