/** Minimal timer used by examples and debugging. */
export class TimeLogger {
  private _start = 0;
  private _last = 0;

  start(): void {
    this._start = performance.now();
    this._last = this._start;
  }

  log(label: string): void {
    const now = performance.now();
    console.log(`${label}: ${(now - this._last).toFixed(2)}ms (total ${(now - this._start).toFixed(2)}ms)`);
    this._last = now;
  }
}
