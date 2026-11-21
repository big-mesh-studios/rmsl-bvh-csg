import { Line3, Plane, Vector3, type Triangle } from "@random-mesh/rmsl-bvh";

const CLIP_EPSILON = 1e-10;
const PARALLEL_EPSILON = 1e-15;
const COPLANAR_NORMAL_EPSILON = 1e-10;
const COPLANAR_DISTANCE_EPSILON = 1e-10;

const _tempLine = new Line3();
const _inputSeg = new Line3();
const _dir = new Vector3();
const _edgeDelta = new Vector3();
const _edgeNormal = new Vector3();
const _edgePlane = new Plane();
const _normalA = new Vector3();
const _normalB = new Vector3();

/** Returns true when two triangles are parallel and lie in the same plane. */
export function isTriangleCoplanar(triA: Triangle, triB: Triangle): boolean {
  triA.getNormal(_normalA);
  triB.getNormal(_normalB);

  const dot = _normalA.dot(_normalB);
  if (Math.abs(1.0 - Math.abs(dot)) >= COPLANAR_NORMAL_EPSILON) return false;

  const dA = _normalA.dot(triA.a);
  const dB = _normalA.dot(triB.a);
  return Math.abs(dA - dB) < COPLANAR_DISTANCE_EPSILON;
}

function clipSegmentToTriangle(segment: Line3, tri: Triangle, normal: Vector3, target: Line3): Line3 | null {
  let tMin = 0;
  let tMax = 1;

  segment.delta(_dir);

  const verts = [tri.a, tri.b, tri.c];
  for (let i = 0; i < 3; i++) {
    const v0 = verts[i];
    const v1 = verts[(i + 1) % 3];

    _edgeDelta.subVectors(v1, v0);
    _edgeNormal.crossVectors(normal, _edgeDelta);
    _edgePlane.setFromNormalAndCoplanarPoint(_edgeNormal, v0);

    const dist = _edgePlane.distanceToPoint(segment.start);
    const denom = _edgePlane.normal.dot(_dir);
    if (Math.abs(denom) < PARALLEL_EPSILON) {
      if (dist < -CLIP_EPSILON) return null;
      continue;
    }

    const t = -dist / denom;
    if (denom > 0) tMin = Math.max(tMin, t);
    else tMax = Math.min(tMax, t);

    if (tMin > tMax + CLIP_EPSILON) return null;
  }

  if (tMax - tMin < CLIP_EPSILON) return null;

  segment.at(tMin, target.start);
  segment.at(tMax, target.end);
  return target;
}

/**
 * Computes the boundary edges of the intersection polygon between two
 * coplanar triangles, by clipping each triangle's edges against the other.
 */
export function getCoplanarIntersectionEdges(triA: Triangle, triB: Triangle, target: Line3[]): number {
  let count = 0;

  triA.getNormal(_normalA);
  triB.getNormal(_normalB);

  const bVerts = [triB.a, triB.b, triB.c];
  for (let i = 0; i < 3; i++) {
    _inputSeg.start.copy(bVerts[i]);
    _inputSeg.end.copy(bVerts[(i + 1) % 3]);

    const result = clipSegmentToTriangle(_inputSeg, triA, _normalA, _tempLine);
    if (result !== null) {
      if (count >= target.length) target.push(new Line3());
      target[count].copy(result);
      count++;
    }
  }

  const aVerts = [triA.a, triA.b, triA.c];
  for (let i = 0; i < 3; i++) {
    _inputSeg.start.copy(aVerts[i]);
    _inputSeg.end.copy(aVerts[(i + 1) % 3]);

    const result = clipSegmentToTriangle(_inputSeg, triB, _normalB, _tempLine);
    if (result !== null) {
      if (count >= target.length) target.push(new Line3());
      target[count].copy(result);
      count++;
    }
  }

  return count;
}
