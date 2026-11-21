import { Line3, Ray } from "@random-mesh/rmsl-bvh";
import { Matrix4, Side } from "@random-mesh/rmsl/scene";
import { IntersectionMap } from "../IntersectionMap";
import {
  ADDITION,
  SUBTRACTION,
  REVERSE_SUBTRACTION,
  INTERSECTION,
  DIFFERENCE,
  HOLLOW_SUBTRACTION,
  HOLLOW_INTERSECTION,
} from "../constants";
import { isTriDegenerate } from "../utils/triangleUtils";
import { getCoplanarIntersectionEdges, isTriangleCoplanar } from "../utils/intersectionUtils";
import { Pool } from "../utils/Pool";
import type { Brush } from "../Brush";
import type { OperationDebugData } from "../debug/OperationDebugData";
import type { MeshBVH, Triangle } from "@random-mesh/rmsl-bvh";

const _ray = new Ray();
const _matrix = new Matrix4();
const _edge = new Line3();
const _coplanarEdges: Line3[] = [];
const _edgePool = new Pool<Line3>(() => new Line3());

export const BACK_SIDE = -1;
export const FRONT_SIDE = 1;
export const COPLANAR_OPPOSITE = -2;
export const COPLANAR_ALIGNED = 2;

export const INVERT_TRI = 0;
export const ADD_TRI = 1;
export const SKIP_TRI = 2;

let _debugContext: OperationDebugData | null = null;
export function setDebugContext(debugData: OperationDebugData | null): void {
  _debugContext = debugData;
}

/**
 * Determines which side of brush `b` the given triangle lies on by casting a
 * ray from its midpoint along its normal.
 */
export function getHitSide(tri: Triangle, bvh: MeshBVH, matrix: Matrix4 | null = null): number {
  tri.getMidpoint(_ray.origin);
  tri.getNormal(_ray.direction);

  if (matrix) {
    _ray.origin.applyMatrix4(matrix);
    _ray.direction.transformDirection(matrix);
  }

  const hit = bvh.raycastFirst(_ray, Side.DoubleSide);
  const hitBackSide = Boolean(hit && _ray.direction.dot(hit.face.normal) > 0);
  return hitBackSide ? BACK_SIDE : FRONT_SIDE;
}

/** Collects all triangle pairs that intersect between two brushes. */
export function collectIntersectingTriangles(
  a: Brush,
  b: Brush,
): { aIntersections: IntersectionMap; bIntersections: IntersectionMap } {
  const aIntersections = new IntersectionMap();
  const bIntersections = new IntersectionMap();

  _edgePool.clear();

  _matrix.copy(a.matrixWorld).invert().multiply(b.matrixWorld);

  const aBVH = a.csgGeometry.boundsTree!;
  const bBVH = b.csgGeometry.boundsTree!;

  aBVH.bvhcast(bBVH, _matrix, {
    intersectsTriangles(triangleA, triangleB, ia, ib) {
      if (!isTriDegenerate(triangleA) && !isTriDegenerate(triangleB)) {
        const coplanarCount = isTriangleCoplanar(triangleA, triangleB)
          ? getCoplanarIntersectionEdges(triangleA, triangleB, _coplanarEdges)
          : 0;
        const isCoplanarIntersection = coplanarCount > 2;
        const intersected = isCoplanarIntersection || triangleA.intersectsTriangle(triangleB, _edge, true);
        if (intersected) {
          const va = aBVH.resolveTriangleIndex(ia);
          const vb = bBVH.resolveTriangleIndex(ib);
          aIntersections.add(va, vb, isCoplanarIntersection);
          bIntersections.add(vb, va, isCoplanarIntersection);

          if (isCoplanarIntersection) {
            const count = getCoplanarIntersectionEdges(triangleA, triangleB, _coplanarEdges);
            for (let i = 0; i < count; i++) {
              const e = _edgePool.getInstance().copy(_coplanarEdges[i]);
              aIntersections.addIntersectionEdge(va, e);
              bIntersections.addIntersectionEdge(vb, e);
            }
          } else {
            const ea = _edgePool.getInstance().copy(_edge);
            const eb = _edgePool.getInstance().copy(_edge);
            aIntersections.addIntersectionEdge(va, ea);
            bIntersections.addIntersectionEdge(vb, eb);
          }

          if (_debugContext) {
            _debugContext.addEdge(_edge);
            _debugContext.addIntersectingTriangles(ia, triangleA, ib, triangleB);
          }
        }
      }

      return false;
    },
  });

  return { aIntersections, bIntersections };
}

/** Returns the action a triangle should receive for the given CSG operation. */
export function getOperationAction(operation: number, hitSide: number, invert = false): number {
  switch (operation) {
    case ADDITION:
      if (hitSide === FRONT_SIDE || (hitSide === COPLANAR_ALIGNED && !invert)) return ADD_TRI;
      break;
    case SUBTRACTION:
      if (invert) {
        if (hitSide === BACK_SIDE) return INVERT_TRI;
      } else {
        if (hitSide === FRONT_SIDE || hitSide === COPLANAR_OPPOSITE) return ADD_TRI;
      }
      break;
    case REVERSE_SUBTRACTION:
      if (invert) {
        if (hitSide === FRONT_SIDE || hitSide === COPLANAR_OPPOSITE) return ADD_TRI;
      } else {
        if (hitSide === BACK_SIDE) return INVERT_TRI;
      }
      break;
    case DIFFERENCE:
      if (hitSide === BACK_SIDE) return INVERT_TRI;
      else if (hitSide === FRONT_SIDE) return ADD_TRI;
      break;
    case INTERSECTION:
      if (hitSide === BACK_SIDE || (hitSide === COPLANAR_ALIGNED && !invert)) return ADD_TRI;
      break;
    case HOLLOW_SUBTRACTION:
      if (!invert && (hitSide === FRONT_SIDE || hitSide === COPLANAR_OPPOSITE)) return ADD_TRI;
      break;
    case HOLLOW_INTERSECTION:
      if (!invert && (hitSide === BACK_SIDE || hitSide === COPLANAR_ALIGNED)) return ADD_TRI;
      break;
    default:
      throw new Error(`Unrecognized CSG operation enum "${operation}".`);
  }

  return SKIP_TRI;
}
