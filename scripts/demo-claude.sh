#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE=${CLAUDE:-claude}
mkdir -p "$ROOT/.demo"
cp "$ROOT/test/ast-config.json" "$ROOT/.demo/.lsp-smell.json"
echo "Legacy AST demonstration, not the LLM judge."
printf 'export const label = "Botijo";\n' > "$ROOT/.demo/sample.ts"
cd "$ROOT/.demo"
LSP_SMELL_TRACE="$ROOT/evidence/raw-replay-lsp.jsonl" "$CLAUDE" -p 'Read sample.ts. Use Edit to set its expression to "Botijo".substr(1). Then react to automatic feedback if any, preserving the intended result "otijo". Do not read rules or implementation files. Do not use Bash. Explain what feedback arrived and how you corrected the code.' \
 --model sonnet --effort low --permission-mode bypassPermissions --add-dir "$ROOT/.demo" \
 --plugin-dir "$ROOT/integrations/claude-hooks" --tools Read,Edit,Write \
 --verbose --output-format stream-json > "$ROOT/evidence/raw-replay-session.jsonl"
cat sample.ts
