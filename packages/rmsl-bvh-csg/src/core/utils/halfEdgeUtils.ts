import { Vector3, type Line3, type Ray } from "@random-mesh/rmsl-bvh";

const DEGENERATE_EPSILON = 1e-8;
const _tempVec = new Vector3();

export function toTriIndex(v: number): number {
  return ~~(v / 3);
}

export function toEdgeIndex(v: number): number {
  return v % 3;
}

export function sortEdgeFunc(a: { start: number }, b: { start: number }): number {
  return a.start - b.start;
}

export function getProjectedDistance(ray: Ray, vec: Vector3): number {
  return _tempVec.subVectors(vec, ray.origin).dot(ray.direction);
}

export function hasOverlaps(arr: { start: number; end: number }[]): boolean {
  arr = [...arr].sort(sortEdgeFunc);
  for (let i = 0, l = arr.length; i < l - 1; i++) {
    const info0 = arr[i];
    const info1 = arr[i + 1];
    if (info1.start < info0.end && Math.abs(info1.start - info0.end) > 1e-5) return true;
  }
  return false;
}

export function getEdgeSetLength(arr: { start: number; end: number }[]): number {
  let tot = 0;
  arr.forEach(({ start, end }) => (tot += end - start));
  return tot;
}

export interface Fragment {
  index: number;
  start: number;
  end: number;
}

export function matchEdges(
  forward: Fragment[],
  reverse: Fragment[],
  disjointConnectivityMap: Map<number, number[]>,
  eps = DEGENERATE_EPSILON,
): void {
  forward.sort(sortEdgeFunc);
  reverse.sort(sortEdgeFunc);

  for (let i = 0; i < forward.length; i++) {
    const e0 = forward[i];
    for (let o = 0; o < reverse.length; o++) {
      const e1 = reverse[o];
      if (e1.start > e0.end) {
        // e1 is completely after e0. Precision issues and thin/degenerate
        // triangles can still leave matching overlaps, so keep searching.
      } else if (e0.end < e1.start || e1.end < e0.start) {
        // e1 is completely before e0
        continue;
      } else if (e0.start <= e1.start && e0.end >= e1.end) {
        // e0 is larger than and e1 is completely within e0
        if (!areDistancesDegenerate(e1.end, e0.end)) {
          forward.splice(i + 1, 0, { start: e1.end, end: e0.end, index: e0.index });
        }

        e0.end = e1.start;
        e1.start = 0;
        e1.end = 0;
      } else if (e0.start >= e1.start && e0.end <= e1.end) {
        // e1 is larger than and e0 is completely within e1
        if (!areDistancesDegenerate(e0.end, e1.end)) {
          reverse.splice(o + 1, 0, { start: e0.end, end: e1.end, index: e1.index });
        }

        e1.end = e0.start;
        e0.start = 0;
        e0.end = 0;
      } else if (e0.start <= e1.start && e0.end <= e1.end) {
        // e1 overlaps e0 at the beginning
        const tmp = e0.end;
        e0.end = e1.start;
        e1.start = tmp;
      } else if (e0.start >= e1.start && e0.end >= e1.end) {
        // e1 overlaps e0 at the end
        const tmp = e1.end;
        e1.end = e0.start;
        e0.start = tmp;
      } else {
        throw new Error("HalfEdgeMap: Unexpected edge overlap configuration.");
      }

      // record the connectivity in both directions
      if (!disjointConnectivityMap.has(e0.index)) disjointConnectivityMap.set(e0.index, []);
      if (!disjointConnectivityMap.has(e1.index)) disjointConnectivityMap.set(e1.index, []);
      disjointConnectivityMap.get(e0.index)!.push(e1.index);
      disjointConnectivityMap.get(e1.index)!.push(e0.index);

      if (isEdgeDegenerate(e1)) {
        reverse.splice(o, 1);
        o--;
      }

      if (isEdgeDegenerate(e0)) {
        // the original forward edge is done, move on to the next one
        forward.splice(i, 1);
        i--;
        break;
      }
    }
  }

  cleanUpEdgeSet(forward);
  cleanUpEdgeSet(reverse);

  function cleanUpEdgeSet(arr: Fragment[]): void {
    for (let i = 0; i < arr.length; i++) {
      if (isEdgeDegenerate(arr[i])) {
        arr.splice(i, 1);
        i--;
      }
    }
  }

  function areDistancesDegenerate(a: number, b: number): boolean {
    return Math.abs(b - a) < eps;
  }

  function isEdgeDegenerate(e: Fragment): boolean {
    return Math.abs(e.end - e.start) < eps;
  }
}

export function getOverlappingLength(a: { start: number; end: number }, b: { start: number; end: number }): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return Math.max(0, end - start);
}

export function getEdgeCenter(edge: Line3, target: Vector3): Vector3 {
  return edge.getCenter(target);
}
