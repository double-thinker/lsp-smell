// Minimal reproduction of the structural stale-owner pattern, not production code.
export class Provider {
  currentTurnRun: string | undefined;
  openTurn(run: string) {
    this.currentTurnRun = run;
  }
}
