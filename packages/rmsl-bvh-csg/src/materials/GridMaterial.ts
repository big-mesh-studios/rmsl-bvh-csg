import { MeshStandardMaterial } from "@random-mesh/rmsl/scene";

/**
 * A material with an optional grid overlay.
 *
 * The original three-bvh-csg `GridMaterial` injected a shader through
 * `onBeforeCompile`. RMSL uses node materials and does not expose that hook,
 * so this port keeps the API (`enableGrid`) but renders the plain material.
 */
export class GridMaterial extends MeshStandardMaterial {
  private _enableGrid = true;

  get enableGrid(): boolean {
    return this._enableGrid;
  }

  set enableGrid(v: boolean) {
    if (this._enableGrid !== v) {
      this._enableGrid = v;
      this.needsUpdate = true;
    }
  }
}
