import { BufferGeometry } from "@random-mesh/rmsl/scene";
import { Brush } from "../Brush";
import { ADDITION } from "../constants";

/** A brush that is part of a hierarchy and carries a CSG operation. */
export class Operation extends Brush {
  readonly isOperation = true;
  operation = ADDITION;

  private _cachedGeometry = new BufferGeometry();
  private _cachedMaterials: unknown = null;
  private _previousOperation: number | null = null;

  markUpdated(): void {
    super.markUpdated();
    this._previousOperation = this.operation;
  }

  isDirty(): boolean {
    return this.operation !== this._previousOperation || super.isDirty();
  }

  insertBefore(brush: Brush): void {
    const parent = this.parent!;
    const index = parent.children.indexOf(this);
    parent.children.splice(index, 0, brush);
  }

  insertAfter(brush: Brush): void {
    const parent = this.parent!;
    const index = parent.children.indexOf(this);
    parent.children.splice(index + 1, 0, brush);
  }
}
