import type { Line3 } from "@random-mesh/rmsl-bvh";

/** Maps triangle indices to the triangles and edges they intersect. */
export class IntersectionMap {
  coplanarSet = new Map<number, Set<number>>();
  intersectionSet = new Map<number, number[]>();
  edgeSet = new Map<number, Set<Line3>>();
  ids: number[] = [];

  add(id: number, intersectionId: number, coplanar = false): void {
    const { intersectionSet, coplanarSet, ids } = this;
    if (!intersectionSet.has(id)) {
      intersectionSet.set(id, []);
      ids.push(id);
    }

    intersectionSet.get(id)!.push(intersectionId);

    if (coplanar) {
      if (!coplanarSet.has(id)) coplanarSet.set(id, new Set());
      coplanarSet.get(id)!.add(intersectionId);
    }
  }

  addIntersectionEdge(id: number, edge: Line3): void {
    const { edgeSet } = this;
    if (!edgeSet.has(id)) edgeSet.set(id, new Set());
    edgeSet.get(id)!.add(edge);
  }

  getIntersectionEdges(id: number): Set<Line3> | null {
    return this.edgeSet.get(id) || null;
  }
}
