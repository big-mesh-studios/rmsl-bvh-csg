import { Group, Matrix4 } from "@random-mesh/rmsl/scene";

/** A group of operations evaluated as a unit. */
export class OperationGroup extends Group {
  readonly isOperationGroup = true;
  private _previousMatrix = new Matrix4();

  markUpdated(): void {
    this._previousMatrix.copy(this.matrix);
  }

  isDirty(): boolean {
    const el1 = this.matrix.elements;
    const el2 = this._previousMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (el1[i] !== el2[i]) return true;
    }
    return false;
  }
}
