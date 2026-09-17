// Isolated lifecycle integration fixture.
// openTurn is invoked after the preceding run has completed.
export class Provider {
  readonly name = "demo";
  currentTurnRun: string | undefined;
  openTurn(run: string) {
    this.currentTurnRun = run;
  }
}
