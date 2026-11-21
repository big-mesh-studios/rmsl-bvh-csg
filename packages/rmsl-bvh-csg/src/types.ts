import type { Box3, MeshBVH, Sphere } from "@random-mesh/rmsl-bvh";
import type { BufferGeometry } from "@random-mesh/rmsl/scene";
import type { HalfEdgeMap } from "./core/HalfEdgeMap";

/**
 * The runtime cache fields the CSG code attaches to a geometry. RMSL's
 * `BufferGeometry` has no `boundsTree` / `halfEdges` / `groupIndices` fields,
 * so they are attached dynamically here.
 */
export interface CSGGeometry extends BufferGeometry {
  boundsTree?: MeshBVH | null;
  halfEdges?: HalfEdgeMap | null;
  groupIndices?: Uint16Array | null;
  boundingBox?: Box3 | null;
  boundingSphere?: Sphere | null;
}

export interface TriangleLike {
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
  c: { x: number; y: number; z: number };
}
