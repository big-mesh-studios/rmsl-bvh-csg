import { HalfEdgeMap } from "../core/HalfEdgeMap";
import type { BufferGeometry, Mesh } from "@random-mesh/rmsl/scene";

/** Returns whether a geometry or mesh is watertight (every edge is shared). */
export function isWaterTight(geometryOrMesh: BufferGeometry | Mesh): boolean {
  let geometry: BufferGeometry;
  if ((geometryOrMesh as Mesh).isMesh) geometry = (geometryOrMesh as Mesh).geometry;
  else geometry = geometryOrMesh as BufferGeometry;

  const halfEdgeMap = new HalfEdgeMap();
  halfEdgeMap.matchDisjointEdges = true;
  halfEdgeMap.updateFrom(geometry);
  return halfEdgeMap.unmatchedEdges === 0;
}
