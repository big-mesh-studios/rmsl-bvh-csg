import { ExtendedTriangle, Line3, Vector3 } from "@random-mesh/rmsl-bvh";
import cdt2d from "../libs/cdt2d";
import { Pool } from "./utils/Pool";

const RELATIVE_EPSILON = 1e-16;
const VERTEX_MERGE_EPSILON = 1e-16;

const _vec = new Vector3();
const _vec2 = new Vector3();
const _paramPool = new Pool<{ param: number; index: number }>(() => ({ param: 0, index: 0 }));
const _vectorPool = new Pool<Vector3>(() => new Vector3());

function edgesToIndices(
  edges: Line3[],
  outputVertices: Vector3[],
  outputIndices: [number, number][],
  epsilonScale: number,
): void {
  _paramPool.clear();

  outputVertices.length = 0;
  outputIndices.length = 0;

  for (let i = 0, l = edges.length; i < l; i++) {
    const edge0 = edges[i];
    getIndex(edge0.start);
    getIndex(edge0.end);
  }

  for (let i = 0, l = edges.length; i < l; i++) {
    const edge0 = edges[i];
    for (let i1 = i + 1; i1 < l; i1++) {
      const edge1 = edges[i1];
      const dist = edge0.distanceSqToLine3(edge1, _vec, _vec2);
      if (dist < RELATIVE_EPSILON * epsilonScale) {
        getIndex(_vec2);
      }
    }
  }

  const arr: { param: number; index: number }[] = [];
  for (let i = 0, l = edges.length; i < l; i++) {
    arr.length = 0;

    const edge = edges[i];
    for (let v = 0, lv = outputVertices.length; v < lv; v++) {
      const vec = outputVertices[v];
      const param = edge.closestPointToPointParameter(vec, true);
      edge.at(param, _vec);
      if (vec.distanceToSquared(_vec) < RELATIVE_EPSILON * epsilonScale) {
        const entry = _paramPool.getInstance();
        entry.param = param;
        entry.index = v;
        arr.push(entry);
      }
    }

    arr.sort(paramSort);

    for (let a = 0, la = arr.length - 1; a < la; a++) {
      const i0 = arr[a].index;
      const i1 = arr[a + 1].index;
      if (i0 === i1) continue;
      outputIndices.push([i0, i1]);
    }
  }

  const edgeSet = new Set<string>();
  let ptr = 0;
  for (let i = 0, l = outputIndices.length; i < l; i++) {
    const e = outputIndices[i];
    const lo = Math.min(e[0], e[1]);
    const hi = Math.max(e[0], e[1]);
    const key = lo + "," + hi;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      outputIndices[ptr++] = e;
    }
  }

  outputIndices.length = ptr;

  function paramSort(a: { param: number }, b: { param: number }): number {
    return a.param - b.param;
  }

  function getIndex(v: Vector3): number {
    for (let i = 0; i < outputVertices.length; i++) {
      const v2 = outputVertices[i];
      if (v === v2 || v.distanceToSquared(v2) < VERTEX_MERGE_EPSILON * epsilonScale) return i;
    }

    outputVertices.push(_vectorPool.getInstance().copy(v));
    return outputVertices.length - 1;
  }
}

/**
 * Splits triangles with a constrained Delaunay triangulation on the triangle
 * plane. This produces better-shaped result triangles than the legacy
 * splitter and caches intersection edges from the BVH cast.
 */
export class CDTTriangleSplitter {
  trianglePool = new Pool<ExtendedTriangle>(() => new ExtendedTriangle());
  linePool = new Pool<Line3>(() => new Line3());

  triangles: ExtendedTriangle[] = [];
  triangleIndices: (number | string)[][] = [];
  constrainedEdges: Line3[] = [];
  triangleConnectivity: number[][] = [];

  normal = new Vector3();
  projOrigin = new Vector3();
  projU = new Vector3();
  projV = new Vector3();
  baseTri = new ExtendedTriangle();
  baseIndices: (number | null)[] = new Array(3);

  initialize(
    tri: ExtendedTriangle,
    i0: number | null = null,
    i1: number | null = null,
    i2: number | null = null,
  ): void {
    this.reset();

    const { normal, baseTri, projU, projV, projOrigin, constrainedEdges, linePool, baseIndices } = this;
    tri.getNormal(normal);
    baseTri.copy(tri);
    baseTri.update();
    baseIndices[0] = i0;
    baseIndices[1] = i1;
    baseIndices[2] = i2;

    constrainedEdges.length = 0;

    const e0 = linePool.getInstance();
    e0.start.copy(baseTri.a);
    e0.end.copy(baseTri.b);

    const e1 = linePool.getInstance();
    e1.start.copy(baseTri.b);
    e1.end.copy(baseTri.c);

    const e2 = linePool.getInstance();
    e2.start.copy(baseTri.c);
    e2.end.copy(baseTri.a);
    constrainedEdges.push(e0, e1, e2);

    projOrigin.copy(baseTri.a);
    projU.subVectors(baseTri.b, baseTri.a).normalize();
    projV.crossVectors(normal, projU).normalize();
  }

  addConstraintEdge(edge: Line3): void {
    const e = this.linePool.getInstance().copy(edge);
    this.constrainedEdges.push(e);
  }

  private _to2D(point: Vector3, target: Vector3): Vector3 {
    const { projOrigin, projU, projV } = this;
    _vec.subVectors(point, projOrigin);
    return target.set(_vec.dot(projU), _vec.dot(projV), 0);
  }

  private _from2D(u: number, v: number, target: Vector3): Vector3 {
    const { projOrigin, projU, projV } = this;
    return target.copy(projOrigin).addScaledVector(projU, u).addScaledVector(projV, v);
  }

  triangulate(): void {
    const {
      triangles,
      trianglePool,
      triangleConnectivity,
      triangleIndices,
      linePool,
      baseTri,
      constrainedEdges,
      baseIndices,
    } = this;

    triangles.length = 0;
    trianglePool.clear();

    const edges2d: Line3[] = [];
    for (let i = 0, l = constrainedEdges.length; i < l; i++) {
      const edge = constrainedEdges[i];
      const e2d = linePool.getInstance();
      this._to2D(edge.start, e2d.start);
      this._to2D(edge.end, e2d.end);
      edges2d.push(e2d);
    }

    let epsilonScale = 0;
    for (let i = 0; i < 3; i++) {
      const v = this._to2D(baseTri.points[i], _vec);
      epsilonScale = Math.max(epsilonScale, Math.abs(v.x), Math.abs(v.y));
    }

    const vertices: Vector3[] = [];
    const indices: [number, number][] = [];
    edgesToIndices(edges2d, vertices, indices, epsilonScale);

    const cdt2dPoints: [number, number][] = [];
    for (let i = 0, l = vertices.length; i < l; i++) {
      cdt2dPoints.push([vertices[i].x, vertices[i].y]);
    }

    const triangulation = cdt2d(cdt2dPoints, indices, { exterior: false });

    const halfEdgeMap = new Map<string, number>();
    for (let i = 0, l = indices.length; i < l; i++) {
      const pair = indices[i];
      halfEdgeMap.set(`${pair[0]}_${pair[1]}`, -1);
      halfEdgeMap.set(`${pair[1]}_${pair[0]}`, -1);
    }

    const indexKeyPrefix = `${baseIndices[0]}_${baseIndices[1]}_${baseIndices[2]}_`;
    for (let ti = 0, l = triangulation.length; ti < l; ti++) {
      const indexList = triangulation[ti];
      const [i0, i1, i2] = indexList;
      const tri = trianglePool.getInstance();
      this._from2D(cdt2dPoints[i0][0], cdt2dPoints[i0][1], tri.a);
      this._from2D(cdt2dPoints[i1][0], cdt2dPoints[i1][1], tri.b);
      this._from2D(cdt2dPoints[i2][0], cdt2dPoints[i2][1], tri.c);
      triangles.push(tri);

      const connected: number[] = [];
      triangleConnectivity.push(connected);

      const indexKeys: (number | string)[] = [];
      triangleIndices.push(indexKeys);
      for (let i = 0; i < 3; i++) {
        const p0 = indexList[i];
        indexKeys.push(p0 < 3 ? baseIndices[p0]! : indexKeyPrefix + p0);

        const p1 = indexList[(i + 1) % 3];
        const hash0 = `${p0}_${p1}`;
        if (halfEdgeMap.has(hash0)) {
          const index = halfEdgeMap.get(hash0)!;
          if (index !== -1) {
            connected.push(index);
            triangleConnectivity[index].push(ti);
          }
        } else {
          halfEdgeMap.set(`${p1}_${p0}`, ti);
        }
      }
    }
  }

  reset(): void {
    this.trianglePool.clear();
    this.linePool.clear();
    this.triangles.length = 0;
    this.triangleIndices.length = 0;
    this.triangleConnectivity.length = 0;
    this.constrainedEdges.length = 0;
  }
}
