import type { BufferGeometry } from "@random-mesh/rmsl/scene";
import { MeshBVH, type MeshBVHOptions } from "./core/MeshBVH";
import { Box3 } from "./math/Box3";
import { Vector3 } from "./math/Vector3";

/** Rebuilds the BVH on `geometry.boundsTree`, or constructs one when missing. */
export function computeBoundsTree(
  geometry: BufferGeometry & { boundsTree?: MeshBVH | null },
  options?: MeshBVHOptions,
): MeshBVH {
  const bvh = new MeshBVH(geometry, options);
  geometry.boundsTree = bvh;
  return bvh;
}

/** Releases the cached BVH from a geometry. */
export function disposeBoundsTree(geometry: { boundsTree?: MeshBVH | null }): void {
  geometry.boundsTree = null;
}

/** Computes and stores the AABB of a geometry's position attribute. */
export function computeBoundingBox(geometry: BufferGeometry & { boundingBox?: Box3 | null }): Box3 {
  const box = new Box3();
  const position = geometry.attributes.position;
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    box.expandByPoint(point);
  }
  geometry.boundingBox = box;
  return box;
}
