import { Line3, closestPointsSegmentToSegment } from "./Line3";
import { Plane } from "./Plane";
import { SeparatingAxisBounds } from "./SeparatingAxisBounds";
import { Triangle } from "./Triangle";
import { Vector2 } from "./Vector2";
import { Vector3 } from "./Vector3";

const componentKeys = ["x", "y", "z"] as const;
const ZERO_EPSILON = 1e-15;
const ZERO_EPSILON_SQR = ZERO_EPSILON * ZERO_EPSILON;

function isNearZero(value: number): boolean {
  return Math.abs(value) < ZERO_EPSILON;
}

function sphereIntersectTriangle(sphere: { center: Vector3; radius: number }, triangle: Triangle): boolean {
  const { radius, center } = sphere;
  const { a, b, c } = triangle;
  const closest = new Vector3();
  const line = new Line3();

  line.set(a, b);
  line.closestPointToPoint(center, true, closest);
  if (closest.distanceTo(center) <= radius) return true;

  line.set(a, c);
  line.closestPointToPoint(center, true, closest);
  if (closest.distanceTo(center) <= radius) return true;

  line.set(b, c);
  line.closestPointToPoint(center, true, closest);
  if (closest.distanceTo(center) <= radius) return true;

  const plane = new Plane().setFromNormalAndCoplanarPoint(triangle.getNormal(new Vector3()), a);
  const projected = plane.projectPoint(center, new Vector3());
  if (triangle.containsPoint(projected) && projected.distanceTo(center) <= radius) return true;

  return false;
}

/**
 * An extended `Triangle` that caches SAT data and implements accurate
 * triangle/triangle intersection, ported from three-mesh-bvh.
 */
export class ExtendedTriangle extends Triangle {
  readonly isExtendedTriangle = true;
  needsUpdate = true;

  satAxes = Array.from({ length: 4 }, () => new Vector3());
  satBounds = Array.from({ length: 4 }, () => new SeparatingAxisBounds());
  points = [this.a, this.b, this.c];
  plane = new Plane();
  isDegenerateIntoSegment = false;
  isDegenerateIntoPoint = false;
  degenerateSegment = new Line3();

  intersectsSphere(sphere: { center: Vector3; radius: number }): boolean {
    return sphereIntersectTriangle(sphere, this);
  }

  update(): void {
    const a = this.a;
    const b = this.b;
    const c = this.c;
    const points = this.points;
    const satAxes = this.satAxes;
    const satBounds = this.satBounds;

    const axis0 = satAxes[0];
    const sab0 = satBounds[0];
    this.getNormal(axis0);
    sab0.setFromPoints(axis0, points);

    const axis1 = satAxes[1];
    const sab1 = satBounds[1];
    axis1.subVectors(a, b);
    sab1.setFromPoints(axis1, points);

    const axis2 = satAxes[2];
    const sab2 = satBounds[2];
    axis2.subVectors(b, c);
    sab2.setFromPoints(axis2, points);

    const axis3 = satAxes[3];
    const sab3 = satBounds[3];
    axis3.subVectors(c, a);
    sab3.setFromPoints(axis3, points);

    const lengthAB = axis1.length();
    const lengthBC = axis2.length();
    const lengthCA = axis3.length();

    this.isDegenerateIntoPoint = false;
    this.isDegenerateIntoSegment = false;

    if (lengthAB < ZERO_EPSILON) {
      if (lengthBC < ZERO_EPSILON || lengthCA < ZERO_EPSILON) {
        this.isDegenerateIntoPoint = true;
      } else {
        this.isDegenerateIntoSegment = true;
        this.degenerateSegment.start.copy(a);
        this.degenerateSegment.end.copy(c);
      }
    } else if (lengthBC < ZERO_EPSILON) {
      if (lengthCA < ZERO_EPSILON) {
        this.isDegenerateIntoPoint = true;
      } else {
        this.isDegenerateIntoSegment = true;
        this.degenerateSegment.start.copy(b);
        this.degenerateSegment.end.copy(a);
      }
    } else if (lengthCA < ZERO_EPSILON) {
      this.isDegenerateIntoSegment = true;
      this.degenerateSegment.start.copy(c);
      this.degenerateSegment.end.copy(b);
    }

    this.plane.setFromNormalAndCoplanarPoint(axis0, a);
    this.needsUpdate = false;
  }

  closestPointToSegment(segment: Line3, target1?: Vector3 | null, target2?: Vector3 | null): number {
    if (this.needsUpdate) this.update();

    const { start, end } = segment;
    const points = this.points;
    const point1 = new Vector3();
    const point2 = new Vector3();
    const edge = new Line3();
    let distSq: number;
    let closestDistanceSq = Infinity;

    const startDist = this.plane.distanceToPoint(start);
    const endDist = this.plane.distanceToPoint(end);
    if (startDist * endDist < 0 && this.plane.intersectLine(segment, point1) !== null && this.containsPoint(point1)) {
      target1?.copy(point1);
      target2?.copy(point1);
      return 0;
    }

    for (let i = 0; i < 3; i++) {
      const nexti = (i + 1) % 3;
      edge.start.copy(points[i]);
      edge.end.copy(points[nexti]);
      closestPointsSegmentToSegment(edge, segment, point1, point2);
      distSq = point1.distanceToSquared(point2);
      if (distSq < closestDistanceSq) {
        closestDistanceSq = distSq;
        target1?.copy(point1);
        target2?.copy(point2);
      }
    }

    this.closestPointToPoint(start, point1);
    distSq = start.distanceToSquared(point1);
    if (distSq < closestDistanceSq) {
      closestDistanceSq = distSq;
      target1?.copy(point1);
      target2?.copy(start);
    }

    this.closestPointToPoint(end, point1);
    distSq = end.distanceToSquared(point1);
    if (distSq < closestDistanceSq) {
      closestDistanceSq = distSq;
      target1?.copy(point1);
      target2?.copy(end);
    }

    return Math.sqrt(closestDistanceSq);
  }

  intersectsTriangle(other: Triangle | ExtendedTriangle, target: Line3 | null = null, suppressLog = false): boolean {
    if (this.needsUpdate) this.update();

    let otherTri: ExtendedTriangle;
    if (!(other instanceof ExtendedTriangle)) {
      _saTri2.copy(other);
      _saTri2.update();
      otherTri = _saTri2;
    } else {
      if (other.needsUpdate) other.update();
      otherTri = other;
    }

    const res = handleDegenerateCases(this, otherTri, target, suppressLog);
    if (res !== undefined) return res;

    const plane1 = this.plane;
    const plane2 = otherTri.plane;

    let a1Dist = plane2.distanceToPoint(this.a);
    let b1Dist = plane2.distanceToPoint(this.b);
    let c1Dist = plane2.distanceToPoint(this.c);
    if (isNearZero(a1Dist)) a1Dist = 0;
    if (isNearZero(b1Dist)) b1Dist = 0;
    if (isNearZero(c1Dist)) c1Dist = 0;

    const a1b1Dist = a1Dist * b1Dist;
    const a1c1Dist = a1Dist * c1Dist;
    if (a1b1Dist > 0 && a1c1Dist > 0) return false;

    let a2Dist = plane1.distanceToPoint(otherTri.a);
    let b2Dist = plane1.distanceToPoint(otherTri.b);
    let c2Dist = plane1.distanceToPoint(otherTri.c);
    if (isNearZero(a2Dist)) a2Dist = 0;
    if (isNearZero(b2Dist)) b2Dist = 0;
    if (isNearZero(c2Dist)) c2Dist = 0;

    const a2b2Dist = a2Dist * b2Dist;
    const a2c2Dist = a2Dist * c2Dist;
    if (a2b2Dist > 0 && a2c2Dist > 0) return false;

    _dir1.copy(plane1.normal);
    _dir2.copy(plane2.normal);
    const intersectionLine = _dir1.cross(_dir2);

    let componentIndex = 0;
    let maxComponent = Math.abs(intersectionLine.x);
    const comp1 = Math.abs(intersectionLine.y);
    if (comp1 > maxComponent) {
      maxComponent = comp1;
      componentIndex = 1;
    }
    const comp2 = Math.abs(intersectionLine.z);
    if (comp2 > maxComponent) componentIndex = 2;

    const key = componentKeys[componentIndex];
    const a1Proj = this.a[key];
    const b1Proj = this.b[key];
    const c1Proj = this.c[key];

    const a2Proj = otherTri.a[key];
    const b2Proj = otherTri.b[key];
    const c2Proj = otherTri.c[key];

    const edge1 = _edge1;
    const edge2 = _edge2;
    const bounds1 = _bounds1;
    const bounds2 = _bounds2;

    if (
      findIntersectionLineBounds(
        this,
        a1Proj,
        b1Proj,
        c1Proj,
        a1b1Dist,
        a1c1Dist,
        a1Dist,
        b1Dist,
        c1Dist,
        bounds1,
        edge1,
      )
    ) {
      return coplanarIntersectsTriangle(this, otherTri, target, suppressLog);
    }

    if (
      findIntersectionLineBounds(
        otherTri,
        a2Proj,
        b2Proj,
        c2Proj,
        a2b2Dist,
        a2c2Dist,
        a2Dist,
        b2Dist,
        c2Dist,
        bounds2,
        edge2,
      )
    ) {
      return coplanarIntersectsTriangle(this, otherTri, target, suppressLog);
    }

    if (bounds1.y < bounds1.x) {
      const tmp = bounds1.y;
      bounds1.y = bounds1.x;
      bounds1.x = tmp;
      _tempPoint.copy(edge1.start);
      edge1.start.copy(edge1.end);
      edge1.end.copy(_tempPoint);
    }

    if (bounds2.y < bounds2.x) {
      const tmp = bounds2.y;
      bounds2.y = bounds2.x;
      bounds2.x = tmp;
      _tempPoint.copy(edge2.start);
      edge2.start.copy(edge2.end);
      edge2.end.copy(_tempPoint);
    }

    if (bounds1.y < bounds2.x || bounds2.y < bounds1.x) return false;

    if (target) {
      if (bounds2.x > bounds1.x) target.start.copy(edge2.start);
      else target.start.copy(edge1.start);

      if (bounds2.y < bounds1.y) target.end.copy(edge2.end);
      else target.end.copy(edge1.end);
    }

    return true;
  }

  distanceToPoint(point: Vector3): number {
    const target = new Vector3();
    this.closestPointToPoint(point, target);
    return point.distanceTo(target);
  }

  distanceToTriangle(other: Triangle, target1: Vector3 | null = null, target2: Vector3 | null = null): number {
    const point = new Vector3();
    const point2 = new Vector3();
    const cornerFields = ["a", "b", "c"] as const;
    const line1 = new Line3();
    const line2 = new Line3();

    const lineTarget = target1 || target2 ? line1 : null;
    if (this.intersectsTriangle(other, lineTarget, true)) {
      if (target1 || target2) {
        lineTarget?.getCenter(target1 ?? new Vector3());
        lineTarget?.getCenter(target2 ?? new Vector3());
      }
      return 0;
    }

    let closestDistanceSq = Infinity;

    for (let i = 0; i < 3; i++) {
      const field = cornerFields[i];
      const otherVec = other[field];
      this.closestPointToPoint(otherVec, point);
      let dist = otherVec.distanceToSquared(point);
      if (dist < closestDistanceSq) {
        closestDistanceSq = dist;
        target1?.copy(point);
        target2?.copy(otherVec);
      }

      const thisVec = this[field];
      other.closestPointToPoint(thisVec, point);
      dist = thisVec.distanceToSquared(point);
      if (dist < closestDistanceSq) {
        closestDistanceSq = dist;
        target1?.copy(thisVec);
        target2?.copy(point);
      }
    }

    for (let i = 0; i < 3; i++) {
      const f11 = cornerFields[i];
      const f12 = cornerFields[(i + 1) % 3];
      line1.set(this[f11], this[f12]);
      for (let i2 = 0; i2 < 3; i2++) {
        const f21 = cornerFields[i2];
        const f22 = cornerFields[(i2 + 1) % 3];
        line2.set(other[f21], other[f22]);
        closestPointsSegmentToSegment(line1, line2, point, point2);
        const dist = point.distanceToSquared(point2);
        if (dist < closestDistanceSq) {
          closestDistanceSq = dist;
          target1?.copy(point);
          target2?.copy(point2);
        }
      }
    }

    return Math.sqrt(closestDistanceSq);
  }
}

const _saTri2 = new ExtendedTriangle();
const _cachedSatBounds = new SeparatingAxisBounds();
const _cachedSatBounds2 = new SeparatingAxisBounds();
const _tmpVec = new Vector3();
const _dir1 = new Vector3();
const _dir2 = new Vector3();
const _tempDir = new Vector3();
const _edge1 = new Line3();
const _edge2 = new Line3();
const _tempPoint = new Vector3();
const _bounds1 = new Vector2();
const _bounds2 = new Vector2();

function coplanarIntersectsTriangle(
  self: ExtendedTriangle,
  other: ExtendedTriangle,
  target: Line3 | null,
  suppressLog: boolean,
): boolean {
  const planeNormal = _tmpVec;
  if (!self.isDegenerateIntoPoint && !self.isDegenerateIntoSegment) planeNormal.copy(self.plane.normal);
  else planeNormal.copy(other.plane.normal);

  const satBounds1 = self.satBounds;
  const satAxes1 = self.satAxes;
  for (let i = 1; i < 4; i++) {
    const sb = satBounds1[i];
    const sa = satAxes1[i];
    _cachedSatBounds.setFromPoints(sa, other.points);
    if (sb.isSeparated(_cachedSatBounds)) return false;

    _tempDir.copy(planeNormal).cross(sa);
    _cachedSatBounds.setFromPoints(_tempDir, self.points);
    _cachedSatBounds2.setFromPoints(_tempDir, other.points);
    if (_cachedSatBounds.isSeparated(_cachedSatBounds2)) return false;
  }

  const satBounds2 = other.satBounds;
  const satAxes2 = other.satAxes;
  for (let i = 1; i < 4; i++) {
    const sb = satBounds2[i];
    const sa = satAxes2[i];
    _cachedSatBounds.setFromPoints(sa, self.points);
    if (sb.isSeparated(_cachedSatBounds)) return false;

    _tempDir.crossVectors(planeNormal, sa);
    _cachedSatBounds.setFromPoints(_tempDir, self.points);
    _cachedSatBounds2.setFromPoints(_tempDir, other.points);
    if (_cachedSatBounds.isSeparated(_cachedSatBounds2)) return false;
  }

  if (target) {
    if (!suppressLog) {
      console.warn(
        "ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0.",
      );
    }
    target.start.set(0, 0, 0);
    target.end.set(0, 0, 0);
  }

  return true;
}

function findSingleBounds(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  aProj: number,
  bProj: number,
  cProj: number,
  aDist: number,
  bDist: number,
  cDist: number,
  bounds: Vector2,
  edge: Line3,
): void {
  let t = aDist / (aDist - bDist);
  bounds.x = aProj + (bProj - aProj) * t;
  edge.start.subVectors(b, a).multiplyScalar(t).add(a);

  t = aDist / (aDist - cDist);
  bounds.y = aProj + (cProj - aProj) * t;
  edge.end.subVectors(c, a).multiplyScalar(t).add(a);
}

function findIntersectionLineBounds(
  self: ExtendedTriangle,
  aProj: number,
  bProj: number,
  cProj: number,
  abDist: number,
  acDist: number,
  aDist: number,
  bDist: number,
  cDist: number,
  bounds: Vector2,
  edge: Line3,
): boolean {
  if (abDist > 0) {
    findSingleBounds(self.c, self.a, self.b, cProj, aProj, bProj, cDist, aDist, bDist, bounds, edge);
  } else if (acDist > 0) {
    findSingleBounds(self.b, self.a, self.c, bProj, aProj, cProj, bDist, aDist, cDist, bounds, edge);
  } else if (bDist * cDist > 0 || aDist !== 0) {
    findSingleBounds(self.a, self.b, self.c, aProj, bProj, cProj, aDist, bDist, cDist, bounds, edge);
  } else if (bDist !== 0) {
    findSingleBounds(self.b, self.a, self.c, bProj, aProj, cProj, bDist, aDist, cDist, bounds, edge);
  } else if (cDist !== 0) {
    findSingleBounds(self.c, self.a, self.b, cProj, aProj, bProj, cDist, aDist, bDist, bounds, edge);
  } else {
    return true;
  }

  return false;
}

function intersectTriangleSegment(
  triangle: ExtendedTriangle,
  degenerateTriangle: ExtendedTriangle,
  target: Line3 | null,
  suppressLog: boolean,
): boolean {
  const segment = degenerateTriangle.degenerateSegment;
  const startDist = triangle.plane.distanceToPoint(segment.start);
  const endDist = triangle.plane.distanceToPoint(segment.end);

  if (isNearZero(startDist)) {
    if (isNearZero(endDist)) {
      return coplanarIntersectsTriangle(triangle, degenerateTriangle, target, suppressLog);
    } else {
      if (target) {
        target.start.copy(segment.start);
        target.end.copy(segment.start);
      }
      return triangle.containsPoint(segment.start);
    }
  } else if (isNearZero(endDist)) {
    if (target) {
      target.start.copy(segment.end);
      target.end.copy(segment.end);
    }
    return triangle.containsPoint(segment.end);
  } else {
    if (triangle.plane.intersectLine(segment, _tmpVec) !== null) {
      if (target) {
        target.start.copy(_tmpVec);
        target.end.copy(_tmpVec);
      }
      return triangle.containsPoint(_tmpVec);
    }
    return false;
  }
}

function intersectTrianglePoint(
  triangle: ExtendedTriangle,
  degenerateTriangle: ExtendedTriangle,
  target: Line3 | null,
): boolean {
  const point = degenerateTriangle.a;
  if (isNearZero(triangle.plane.distanceToPoint(point)) && triangle.containsPoint(point)) {
    if (target) {
      target.start.copy(point);
      target.end.copy(point);
    }
    return true;
  }
  return false;
}

function intersectSegmentPoint(
  segmentTri: ExtendedTriangle,
  pointTri: ExtendedTriangle,
  target: Line3 | null,
): boolean {
  const segment = segmentTri.degenerateSegment;
  const point = pointTri.a;
  segment.closestPointToPoint(point, true, _tmpVec);
  if (point.distanceToSquared(_tmpVec) < ZERO_EPSILON_SQR) {
    if (target) {
      target.start.copy(point);
      target.end.copy(point);
    }
    return true;
  }
  return false;
}

function handleDegenerateCases(
  self: ExtendedTriangle,
  other: ExtendedTriangle,
  target: Line3 | null,
  suppressLog: boolean,
): boolean | undefined {
  if (self.isDegenerateIntoSegment) {
    if (other.isDegenerateIntoSegment) {
      const segment1 = self.degenerateSegment;
      const segment2 = other.degenerateSegment;
      const delta1 = _dir1;
      const delta2 = _dir2;
      segment1.delta(delta1);
      segment2.delta(delta2);
      const startDelta = _tmpVec.subVectors(segment2.start, segment1.start);

      const denom = delta1.x * delta2.y - delta1.y * delta2.x;
      if (isNearZero(denom)) return false;

      const t = (startDelta.x * delta2.y - startDelta.y * delta2.x) / denom;
      const u = -(delta1.x * startDelta.y - delta1.y * startDelta.x) / denom;

      if (t < 0 || t > 1 || u < 0 || u > 1) return false;

      const z1 = segment1.start.z + delta1.z * t;
      const z2 = segment2.start.z + delta2.z * u;

      if (isNearZero(z1 - z2)) {
        if (target) {
          target.start.copy(segment1.start).addScaledVector(delta1, t);
          target.end.copy(segment1.start).addScaledVector(delta1, t);
        }
        return true;
      }
      return false;
    } else if (other.isDegenerateIntoPoint) {
      return intersectSegmentPoint(self, other, target);
    } else {
      return intersectTriangleSegment(other, self, target, suppressLog);
    }
  } else if (self.isDegenerateIntoPoint) {
    if (other.isDegenerateIntoPoint) {
      if (other.a.distanceToSquared(self.a) < ZERO_EPSILON_SQR) {
        if (target) {
          target.start.copy(self.a);
          target.end.copy(self.a);
        }
        return true;
      }
      return false;
    } else if (other.isDegenerateIntoSegment) {
      return intersectSegmentPoint(other, self, target);
    } else {
      return intersectTrianglePoint(other, self, target);
    }
  } else if (other.isDegenerateIntoPoint) {
    return intersectTrianglePoint(self, other, target);
  } else if (other.isDegenerateIntoSegment) {
    return intersectTriangleSegment(self, other, target, suppressLog);
  }

  return undefined;
}
