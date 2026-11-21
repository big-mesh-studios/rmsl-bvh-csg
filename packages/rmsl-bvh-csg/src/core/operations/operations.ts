import { Matrix3, Matrix4 } from "@random-mesh/rmsl/scene";
import { Triangle, Vector3 } from "@random-mesh/rmsl-bvh";
import {
  getHitSide,
  collectIntersectingTriangles,
  getOperationAction,
  SKIP_TRI,
  INVERT_TRI,
  COPLANAR_ALIGNED,
  COPLANAR_OPPOSITE,
} from "./operationsUtils";
import { getTriCount } from "../utils/geometryUtils";
import { HOLLOW_INTERSECTION, HOLLOW_SUBTRACTION } from "../constants";
import { isTriDegenerate } from "../utils/triangleUtils";
import { Pool } from "../utils/Pool";
import type { Brush } from "../Brush";
import type { IntersectionMap } from "../IntersectionMap";
import type { GeometryBuilder } from "./GeometryBuilder";
import type { Line3 } from "@random-mesh/rmsl-bvh";

const _matrix = new Matrix4();
const _inverseMatrix = new Matrix4();
const _builderMatrix = new Matrix4();
const _normalMatrix = new Matrix3();
const _triA = new Triangle();
const _triB = new Triangle();
const _tri = new Triangle();
const _barycoordTri = new Triangle();
const _actions: number[] = [];
const _builders: GeometryBuilder[] = [];
const _traversed = new Set<number>();
const _midpoint = new Vector3();
const _normal = new Vector3();
const _coplanarTrianglePool = new Pool<Triangle>(() => new Triangle());
const _coplanarNormal = new Vector3();
const _coplanarTriangles: Triangle[] = [];

interface Splitter {
  triangles: Triangle[];
  triangleIndices?: (number | string)[][];
  reset(): void;
  initialize(tri: Triangle, i0?: number | null, i1?: number | null, i2?: number | null): void;
  splitByTriangle?(triangle: Triangle, isCoplanar: boolean): void;
  addConstraintEdge?(edge: Line3): void;
  triangulate?(): void;
}

/**
 * Runs the given operations between brushes `a` and `b`, filling the geometry
 * builders with the result triangles.
 */
export function performOperation(
  a: Brush,
  b: Brush,
  operations: number[],
  splitter: Splitter,
  builders: GeometryBuilder[],
  options: { useGroups?: boolean } = {},
): { groups: never[]; materials: null } {
  const { useGroups = true } = options;
  const { aIntersections, bIntersections } = collectIntersectingTriangles(a, b);
  const resultGroups: never[] = [];
  const resultMaterials = null;

  let groupOffset = useGroups ? 0 : -1;
  performWholeTriangleOperations(a, b, aIntersections, operations, false, builders, groupOffset);
  performSplitTriangleOperations(a, b, aIntersections, operations, false, splitter, builders, groupOffset);

  const nonHollow = operations.findIndex((op) => op !== HOLLOW_INTERSECTION && op !== HOLLOW_SUBTRACTION) !== -1;

  if (nonHollow) {
    builders.forEach((builder) => builder.clearIndexMap());

    groupOffset = useGroups ? 1 : -1;
    performWholeTriangleOperations(b, a, bIntersections, operations, true, builders, groupOffset);
    performSplitTriangleOperations(b, a, bIntersections, operations, true, splitter, builders, groupOffset);
  }

  builders.forEach((builder) => builder.clearIndexMap());
  _actions.length = 0;

  return { groups: resultGroups, materials: resultMaterials };
}

function performSplitTriangleOperations(
  a: Brush,
  b: Brush,
  intersectionMap: IntersectionMap,
  operations: number[],
  invert: boolean,
  splitter: Splitter,
  builders: GeometryBuilder[],
  groupOffset = 0,
): number {
  _matrix.copy(b.matrixWorld).invert().multiply(a.matrixWorld);
  _inverseMatrix.copy(_matrix).invert();

  if (invert) _builderMatrix.copy(_matrix);
  else _builderMatrix.identity();

  const invertedGeometry = _builderMatrix.determinant() < 0;
  _normalMatrix.getNormalMatrix(_builderMatrix);
  const normalScale = invertedGeometry ? -1 : 1;

  builders.forEach((builder) => (builder.normalMatrixScale = normalScale));

  const aGeometry = a.csgGeometry;
  const groupIndices = aGeometry.groupIndices!;
  const aIndex = aGeometry.index;
  const aPosition = aGeometry.attributes.position;

  const bBVH = b.csgGeometry.boundsTree!;
  const bIndex = b.csgGeometry.index;
  const bPosition = b.csgGeometry.attributes.position;
  const splitIds = intersectionMap.ids;

  for (let i = 0, l = splitIds.length; i < l; i++) {
    const ia = splitIds[i];
    const groupIndex = groupOffset === -1 ? 0 : groupIndices[ia] + groupOffset;

    const ia3 = 3 * ia;
    let ia0 = ia3 + 0;
    let ia1 = ia3 + 1;
    let ia2 = ia3 + 2;
    if (aIndex) {
      ia0 = aIndex.getX(ia0);
      ia1 = aIndex.getX(ia1);
      ia2 = aIndex.getX(ia2);
    }

    _triA.a.fromBufferAttribute(aPosition, ia0);
    _triA.b.fromBufferAttribute(aPosition, ia1);
    _triA.c.fromBufferAttribute(aPosition, ia2);
    if (invert) {
      _triA.a.applyMatrix4(_matrix);
      _triA.b.applyMatrix4(_matrix);
      _triA.c.applyMatrix4(_matrix);
    }

    splitter.reset();
    splitter.initialize(_triA, ia0, ia1, ia2);

    _coplanarTriangles.length = 0;
    _coplanarTrianglePool.clear();
    _triA.getNormal(_normal);

    const coplanarIndices = intersectionMap.coplanarSet.get(ia);
    if (coplanarIndices) {
      for (const index of coplanarIndices) {
        const ib3 = 3 * index;
        let ib0 = ib3 + 0;
        let ib1 = ib3 + 1;
        let ib2 = ib3 + 2;

        if (bIndex) {
          ib0 = bIndex.getX(ib0);
          ib1 = bIndex.getX(ib1);
          ib2 = bIndex.getX(ib2);
        }

        const inst = _coplanarTrianglePool.getInstance();
        inst.a.fromBufferAttribute(bPosition, ib0);
        inst.b.fromBufferAttribute(bPosition, ib1);
        inst.c.fromBufferAttribute(bPosition, ib2);

        if (!invert) {
          inst.a.applyMatrix4(_inverseMatrix);
          inst.b.applyMatrix4(_inverseMatrix);
          inst.c.applyMatrix4(_inverseMatrix);
        }

        _coplanarTriangles.push(inst);
      }
    }

    if (splitter.addConstraintEdge) {
      const edges = intersectionMap.getIntersectionEdges(ia);
      if (edges) {
        for (const edge of edges) splitter.addConstraintEdge(edge);
      }
      splitter.triangulate!();
    } else {
      const intersectionSet = intersectionMap.intersectionSet;
      const intersectingIndices = intersectionSet.get(ia) ?? [];
      for (let ib = 0, lb = intersectingIndices.length; ib < lb; ib++) {
        const index = intersectingIndices[ib];
        const isCoplanar = coplanarIndices ? coplanarIndices.has(index) : false;
        const ib3 = 3 * index;
        let ib0 = ib3 + 0;
        let ib1 = ib3 + 1;
        let ib2 = ib3 + 2;

        if (bIndex) {
          ib0 = bIndex.getX(ib0);
          ib1 = bIndex.getX(ib1);
          ib2 = bIndex.getX(ib2);
        }

        _triB.a.fromBufferAttribute(bPosition, ib0);
        _triB.b.fromBufferAttribute(bPosition, ib1);
        _triB.c.fromBufferAttribute(bPosition, ib2);

        if (!invert) {
          _triB.a.applyMatrix4(_inverseMatrix);
          _triB.b.applyMatrix4(_inverseMatrix);
          _triB.c.applyMatrix4(_inverseMatrix);
        }

        splitter.splitByTriangle!(_triB, isCoplanar);
      }
    }

    const { triangles, triangleIndices = [] } = splitter;
    for (let bi = 0, bl = builders.length; bi < bl; bi++) {
      builders[bi].initInterpolatedAttributeData(aGeometry, _builderMatrix, _normalMatrix, ia0, ia1, ia2);
    }

    _traversed.clear();
    for (let ib = 0, lb = triangles.length; ib < lb; ib++) {
      if (_traversed.has(ib)) continue;

      const clippedTri = triangles[ib];
      const raycastMatrix = invert ? null : _matrix;
      let hitSide: number | null = null;

      clippedTri.getMidpoint(_midpoint);
      for (let cp = 0, cpl = _coplanarTriangles.length; cp < cpl; cp++) {
        const cpt = _coplanarTriangles[cp];
        if (cpt.containsPoint(_midpoint)) {
          cpt.getNormal(_coplanarNormal);
          hitSide = _normal.dot(_coplanarNormal) > 0 ? COPLANAR_ALIGNED : COPLANAR_OPPOSITE;
          break;
        }
      }

      if (hitSide === null) hitSide = getHitSide(clippedTri, bBVH, raycastMatrix);

      _actions.length = 0;
      _builders.length = 0;

      for (let o = 0, lo = operations.length; o < lo; o++) {
        const op = getOperationAction(operations[o], hitSide, invert);
        if (op !== SKIP_TRI) {
          _actions.push(op);
          _builders.push(builders[o]);
        }
      }

      if (_builders.length !== 0) {
        const stack = [ib];
        while (stack.length > 0) {
          const index = stack.pop()!;
          if (_traversed.has(index)) continue;
          _traversed.add(index);

          const indices = triangleIndices[index];
          let t0: number | string | null = null;
          let t1: number | string | null = null;
          let t2: number | string | null = null;
          if (indices) {
            t0 = indices[0];
            t1 = indices[1];
            t2 = indices[2];
          }

          const tri = triangles[index];
          _triA.getBarycoord(tri.a, _barycoordTri.a);
          _triA.getBarycoord(tri.b, _barycoordTri.b);
          _triA.getBarycoord(tri.c, _barycoordTri.c);

          for (let k = 0, lk = _builders.length; k < lk; k++) {
            const builder = _builders[k];
            const action = _actions[k];
            const invertTri = action === INVERT_TRI;
            const inverted = invertedGeometry !== invertTri;

            builder.appendInterpolatedAttributeData(groupIndex, _barycoordTri.a, t0, inverted);
            if (inverted) {
              builder.appendInterpolatedAttributeData(groupIndex, _barycoordTri.c, t2, inverted);
              builder.appendInterpolatedAttributeData(groupIndex, _barycoordTri.b, t1, inverted);
            } else {
              builder.appendInterpolatedAttributeData(groupIndex, _barycoordTri.b, t1, inverted);
              builder.appendInterpolatedAttributeData(groupIndex, _barycoordTri.c, t2, inverted);
            }
          }
        }
      }
    }
  }

  return splitIds.length;
}

function performWholeTriangleOperations(
  a: Brush,
  b: Brush,
  splitTriSet: IntersectionMap,
  operations: number[],
  invert: boolean,
  builders: GeometryBuilder[],
  groupOffset = 0,
): void {
  _matrix.copy(b.matrixWorld).invert().multiply(a.matrixWorld);

  if (invert) _builderMatrix.copy(_matrix);
  else _builderMatrix.identity();

  const invertedGeometry = _builderMatrix.determinant() < 0;
  _normalMatrix.getNormalMatrix(_builderMatrix);
  const normalScale = invertedGeometry ? -1 : 1;

  builders.forEach((builder) => (builder.normalMatrixScale = normalScale));

  const bBVH = b.csgGeometry.boundsTree!;
  const aGeometry = a.csgGeometry;
  const groupIndices = aGeometry.groupIndices!;
  const aIndex = aGeometry.index;
  const aPosition = aGeometry.attributes.position;

  const stack: number[] = [];
  const halfEdges = aGeometry.halfEdges!;

  const traversedSet = new Set<number>(splitTriSet.ids);
  const triCount = getTriCount(aGeometry);
  for (let id = 0; id < triCount; id++) {
    if (traversedSet.size === triCount) break;
    if (traversedSet.has(id)) continue;

    traversedSet.add(id);
    stack.push(id);

    const i3 = 3 * id;
    let i0 = i3 + 0;
    let i1 = i3 + 1;
    let i2 = i3 + 2;
    if (aIndex) {
      i0 = aIndex.getX(i0);
      i1 = aIndex.getX(i1);
      i2 = aIndex.getX(i2);
    }

    _tri.a.fromBufferAttribute(aPosition, i0);
    _tri.b.fromBufferAttribute(aPosition, i1);
    _tri.c.fromBufferAttribute(aPosition, i2);
    if (invert) {
      _tri.a.applyMatrix4(_matrix);
      _tri.b.applyMatrix4(_matrix);
      _tri.c.applyMatrix4(_matrix);
    }

    const hitSide = getHitSide(_tri, bBVH, invert ? null : _matrix);

    _actions.length = 0;
    _builders.length = 0;
    for (let o = 0, lo = operations.length; o < lo; o++) {
      const op = getOperationAction(operations[o], hitSide, invert);
      if (op !== SKIP_TRI) {
        _actions.push(op);
        _builders.push(builders[o]);
      }
    }

    while (stack.length > 0) {
      const currId = stack.pop()!;
      for (let i = 0; i < 3; i++) {
        const sid = halfEdges.getSiblingTriangleIndex(currId, i);
        if (sid !== -1 && !traversedSet.has(sid)) {
          stack.push(sid);
          traversedSet.add(sid);
        }
      }

      if (_builders.length !== 0) {
        const ci3 = 3 * currId;
        let ci0 = ci3 + 0;
        let ci1 = ci3 + 1;
        let ci2 = ci3 + 2;
        if (aIndex) {
          ci0 = aIndex.getX(ci0);
          ci1 = aIndex.getX(ci1);
          ci2 = aIndex.getX(ci2);
        }

        const groupIndex = groupOffset === -1 ? 0 : groupIndices[currId] + groupOffset;

        _tri.a.fromBufferAttribute(aPosition, ci0);
        _tri.b.fromBufferAttribute(aPosition, ci1);
        _tri.c.fromBufferAttribute(aPosition, ci2);
        if (!isTriDegenerate(_tri)) {
          for (let k = 0, lk = _builders.length; k < lk; k++) {
            const builder = _builders[k];
            const action = _actions[k];
            const invertTri = action === INVERT_TRI;
            const inverted = invertTri !== invertedGeometry;
            builder.appendIndexFromGeometry(aGeometry, _builderMatrix, _normalMatrix, groupIndex, ci0, inverted);

            if (inverted) {
              builder.appendIndexFromGeometry(aGeometry, _builderMatrix, _normalMatrix, groupIndex, ci2, inverted);
              builder.appendIndexFromGeometry(aGeometry, _builderMatrix, _normalMatrix, groupIndex, ci1, inverted);
            } else {
              builder.appendIndexFromGeometry(aGeometry, _builderMatrix, _normalMatrix, groupIndex, ci1, inverted);
              builder.appendIndexFromGeometry(aGeometry, _builderMatrix, _normalMatrix, groupIndex, ci2, inverted);
            }
          }
        }
      }
    }
  }
}
