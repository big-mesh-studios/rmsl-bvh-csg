import { Line3, Plane, Ray, Triangle, Vector3 } from "@random-mesh/rmsl-bvh";
import type { BufferGeometry } from "@random-mesh/rmsl/scene";
import { EdgesHelper } from "./EdgesHelper";
import { getTriCount } from "../core/utils/geometryUtils";
import { toNormalizedRay } from "../core/utils/hashUtils";
import type { HalfEdgeMap } from "../core/HalfEdgeMap";

const vertKeys = ["a", "b", "c"] as const;
const _tri1 = new Triangle();
const _tri2 = new Triangle();
const _center = new Vector3();
const _center2 = new Vector3();
const _projected = new Vector3();
const _projected2 = new Vector3();
const _projectedDir = new Vector3();
const _projectedDir2 = new Vector3();
const _edgeDir = new Vector3();
const _edgeDir2 = new Vector3();
const _vec = new Vector3();
const _vec2 = new Vector3();
const _finalPoint = new Vector3();
const _finalPoint2 = new Vector3();
const _plane = new Plane();
const _plane2 = new Plane();
const _centerPoint = new Vector3();
const _ray = new Ray();
const _edge = new Line3();

function getVertex(tri: Triangle, key: "a" | "b" | "c"): Vector3 {
  return tri[key];
}

function getTriangle(geometry: BufferGeometry, triIndex: number, target: Triangle): Triangle {
  const i3 = 3 * triIndex;
  let i0 = i3 + 0;
  let i1 = i3 + 1;
  let i2 = i3 + 2;

  const indexAttr = geometry.index;
  const posAttr = geometry.attributes.position;
  if (indexAttr) {
    i0 = indexAttr.getX(i0);
    i1 = indexAttr.getX(i1);
    i2 = indexAttr.getX(i2);
  }

  target.a.fromBufferAttribute(posAttr, i0);
  target.b.fromBufferAttribute(posAttr, i1);
  target.c.fromBufferAttribute(posAttr, i2);

  return target;
}

function getOverlapEdge(tri1: Triangle, e1: number, tri2: Triangle, e2: number, target: Line3): void {
  const nextE_0 = (e1 + 1) % 3;
  const v0_1 = getVertex(tri1, vertKeys[e1]);
  const v1_1 = getVertex(tri1, vertKeys[nextE_0]);

  const nextE_1 = (e2 + 1) % 3;
  const v0_2 = getVertex(tri2, vertKeys[e2]);
  const v1_2 = getVertex(tri2, vertKeys[nextE_1]);

  toNormalizedRay(v0_1, v1_1, _ray);

  let d0_1 = _vec.subVectors(v0_1, _ray.origin).dot(_ray.direction);
  let d1_1 = _vec.subVectors(v1_1, _ray.origin).dot(_ray.direction);
  if (d0_1 > d1_1) [d0_1, d1_1] = [d1_1, d0_1];

  let d0_2 = _vec.subVectors(v0_2, _ray.origin).dot(_ray.direction);
  let d1_2 = _vec.subVectors(v1_2, _ray.origin).dot(_ray.direction);
  if (d0_2 > d1_2) [d0_2, d1_2] = [d1_2, d0_2];

  const final_0 = Math.max(d0_1, d0_2);
  const final_1 = Math.min(d1_1, d1_2);
  _ray.at(final_0, target.start);
  _ray.at(final_1, target.end);
}

/** Renders half-edge connections between triangles for debugging. */
export class HalfEdgeHelper extends EdgesHelper {
  straightEdges = false;
  displayDisconnectedEdges = false;

  constructor(geometry: BufferGeometry | null = null, halfEdges: HalfEdgeMap | null = null) {
    super();
    if (geometry && halfEdges) this.setHalfEdges(geometry, halfEdges);
  }

  setHalfEdges(geometry: BufferGeometry, halfEdges: HalfEdgeMap): void {
    const { straightEdges, displayDisconnectedEdges } = this;
    const edges: Line3[] = [];
    const triCount = getTriCount(geometry);

    if (displayDisconnectedEdges) {
      if (halfEdges.unmatchedDisjointEdges) {
        halfEdges.unmatchedDisjointEdges.forEach(({ forward, reverse, ray }) => {
          [...forward, ...reverse].forEach(({ start, end }) => {
            const edge = new Line3();
            ray.at(start, edge.start);
            ray.at(end, edge.end);
            edges.push(edge);
          });
        });
      } else {
        for (let triIndex = 0; triIndex < triCount; triIndex++) {
          getTriangle(geometry, triIndex, _tri1);
          for (let e = 0; e < 3; e++) {
            const otherTriIndex = halfEdges.getSiblingTriangleIndex(triIndex, e);
            if (otherTriIndex === -1) {
              const nextE = (e + 1) % 3;
              const v0 = getVertex(_tri1, vertKeys[e]);
              const v1 = getVertex(_tri1, vertKeys[nextE]);
              const edge = new Line3();
              edge.start.copy(v0);
              edge.end.copy(v1);
              edges.push(edge);
            }
          }
        }
      }
    } else {
      for (let triIndex = 0; triIndex < triCount; triIndex++) {
        getTriangle(geometry, triIndex, _tri1);
        for (let e = 0; e < 3; e++) {
          const otherTriIndex = halfEdges.getSiblingTriangleIndex(triIndex, e);
          if (otherTriIndex === -1) continue;

          getTriangle(geometry, otherTriIndex, _tri2);

          const nextE = (e + 1) % 3;
          const v0 = getVertex(_tri1, vertKeys[e]);
          const v1 = getVertex(_tri1, vertKeys[nextE]);
          _centerPoint.lerpVectors(v0, v1, 0.5);
          addConnectionEdge(_tri1, _tri2, _centerPoint);
        }

        if (halfEdges.disjointConnections) {
          for (let e = 0; e < 3; e++) {
            const disjointTriIndices = halfEdges.getDisjointSiblingTriangleIndices(triIndex, e);
            const disjointEdgeIndices = halfEdges.getDisjointSiblingEdgeIndices(triIndex, e);

            for (let i = 0; i < disjointTriIndices.length; i++) {
              const ti = disjointTriIndices[i];
              const ei = disjointEdgeIndices[i];

              getTriangle(geometry, ti, _tri2);

              getOverlapEdge(_tri1, e, _tri2, ei, _edge);

              _centerPoint.lerpVectors(_edge.start, _edge.end, 0.5);
              addConnectionEdge(_tri1, _tri2, _centerPoint);
            }
          }
        }
      }
    }

    super.setEdges(edges);

    function addConnectionEdge(tri1: Triangle, tri2: Triangle, centerPoint: Vector3): void {
      tri1.getMidpoint(_center);
      tri2.getMidpoint(_center2);

      tri1.getPlane(_plane);
      tri2.getPlane(_plane2);

      const edge = new Line3();
      edge.start.copy(_center);

      if (straightEdges) {
        _plane.projectPoint(_center2, _projected);
        _plane2.projectPoint(_center, _projected2);

        _projectedDir.subVectors(_projected, _center);
        _projectedDir2.subVectors(_projected2, _center2);

        _edgeDir.subVectors(centerPoint, _center);
        _edgeDir2.subVectors(centerPoint, _center2);

        if (_projectedDir.dot(_edgeDir) < 0) _projectedDir.multiplyScalar(-1);
        if (_projectedDir2.dot(_edgeDir2) < 0) _projectedDir2.multiplyScalar(-1);

        _vec.addVectors(_center, _projectedDir);
        _vec2.addVectors(_center2, _projectedDir2);

        tri1.closestPointToPoint(_vec, _finalPoint);
        tri2.closestPointToPoint(_vec2, _finalPoint2);

        edge.end.lerpVectors(_finalPoint, _finalPoint2, 0.5);
      } else {
        edge.end.copy(centerPoint);
      }

      edges.push(edge);
    }
  }
}
