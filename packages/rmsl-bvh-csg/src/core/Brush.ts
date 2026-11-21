import { MeshBVH } from "@random-mesh/rmsl-bvh";
import { BufferGeometry, Matrix4, Mesh, MeshBasicMaterial, type Material } from "@random-mesh/rmsl/scene";
import { HalfEdgeMap } from "./HalfEdgeMap";
import { getTriCount } from "./utils/geometryUtils";
import type { CSGGeometry } from "../types";

// RMSL geometries and attributes have no uuid, so give them stable local ids
// for cache invalidation.
const _ids = new WeakMap<object, number>();
let _nextId = 0;
function getId(value: object): number {
  let id = _ids.get(value);
  if (id === undefined) {
    id = _nextId++;
    _ids.set(value, id);
  }
  return id;
}

/**
 * A mesh that carries the cached CSG data (BVH, half-edge map and group
 * indices) for a geometry. Operations are evaluated against brushes.
 */
export class Brush extends Mesh {
  readonly isBrush = true;

  private _previousMatrix = new Matrix4();
  private _hash: string | null = null;

  constructor(geometry: BufferGeometry = new BufferGeometry(), material: Material = new MeshBasicMaterial()) {
    super(geometry, material);
    this._previousMatrix.elements.fill(0);
  }

  get csgGeometry(): CSGGeometry {
    return this.geometry as CSGGeometry;
  }

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

  prepareGeometry(): void {
    const geometry = this.csgGeometry;
    const attributes = geometry.attributes;
    const index = geometry.index;
    const posAttr = attributes.position;

    const indexHash = index ? `${getId(index)}_${index.count}_${index.version}` : "-1_-1_-1";
    const posHash = `${getId(posAttr)}_${posAttr.count}_${posAttr.version}`;
    const hash = `${getId(geometry)}_${indexHash}_${posHash}`;
    if (this._hash === hash) return;

    this._hash = hash;

    // generate the bounds tree
    geometry.boundsTree = new MeshBVH(geometry, { targetLeafSize: 3 });

    // generate the half-edge map
    if (!geometry.halfEdges) geometry.halfEdges = new HalfEdgeMap();
    geometry.halfEdges.updateFrom(geometry);

    // RMSL has no material groups, so every triangle belongs to group 0.
    const triCount = getTriCount(geometry);
    if (!geometry.groupIndices || geometry.groupIndices.length !== triCount) {
      geometry.groupIndices = new Uint16Array(triCount);
    }
  }

  disposeCacheData(): void {
    const geometry = this.csgGeometry;
    geometry.halfEdges = null;
    geometry.boundsTree = null;
    geometry.groupIndices = null;
    this._hash = null;
  }
}
