// class for getting reusable object instances and releasing them for reuse
export class Pool<T> {
  private createFn: () => T;
  private _pool: T[] = [];
  private _index = 0;

  constructor(createFn: () => T) {
    this.createFn = createFn;
  }

  getInstance(): T {
    if (this._index >= this._pool.length) {
      this._pool.push(this.createFn());
    }
    return this._pool[this._index++];
  }

  clear(): void {
    this._index = 0;
  }

  reset(): void {
    this._pool.length = 0;
    this._index = 0;
  }
}
