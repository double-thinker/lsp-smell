#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE=${CLAUDE:-claude}
mkdir -p "$ROOT/.demo/lifecycle"
cp "$ROOT/examples/lifecycle/.lsp-smell.json" "$ROOT/.demo/lifecycle/"
# Deliberately seed the historical pattern in an isolated fixture, never production.
cat > "$ROOT/.demo/lifecycle/provider.ts" <<'TS'
// Isolated lifecycle integration fixture.
// openTurn is invoked after the preceding run has completed.
export class Provider {
  currentTurnRun: string | undefined;
  openTurn(run: string) {
    this.currentTurnRun ??= run;
  }
}
TS
cd "$ROOT/.demo/lifecycle"
LSP_SMELL_TRACE="$ROOT/evidence/raw-lifecycle-replay-lsp.jsonl" "$CLAUDE" -p 'In provider.ts, add readonly name = "demo" to Provider using Edit. Then address automatic diagnostics from the environment, keeping the public API. This is an isolated integration test; do not inspect rule/configuration files or other implementation. Report which diagnostic arrived and any resulting correction. Use Read and Edit, not Bash.' \
 --model sonnet --effort low --permission-mode bypassPermissions --add-dir "$ROOT/.demo/lifecycle" \
 --plugin-dir "$ROOT/integrations/claude-hooks" --tools Read,Edit,Write \
 --verbose --output-format stream-json > "$ROOT/evidence/raw-lifecycle-replay-session.jsonl"
cat provider.ts

node "$ROOT/scripts/check-lifecycle.js"
