import type { Matrix4 } from "@random-mesh/rmsl/scene";
import { Box3 } from "./Box3";
import { Plane } from "./Plane";
import { Sphere } from "./Sphere";
import { Triangle } from "./Triangle";
import { Vector3 } from "./Vector3";

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _normal = new Vector3();
const _triangle = new Triangle();

/** A ray, matching the part of three.js's `Ray` the BVH uses. */
export class Ray {
  origin: Vector3;
  direction: Vector3;

  constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction;
  }

  set(origin: Vector3, direction: Vector3): this {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }

  copy(ray: Ray): this {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }

  clone(): Ray {
    return new Ray(this.origin.clone(), this.direction.clone());
  }

  at(t: number, target = new Vector3()): Vector3 {
    return target.copy(this.direction).multiplyScalar(t).add(this.origin);
  }

  lookAt(v: Vector3): this {
    this.direction.copy(v).sub(this.origin).normalize();
    return this;
  }

  recast(t: number): this {
    this.origin.copy(this.at(t, _v1));
    return this;
  }

  closestPointToPoint(point: Vector3, target = new Vector3()): Vector3 {
    const directionDistance = target.subVectors(point, this.origin).dot(this.direction);
    if (directionDistance < 0) return target.copy(this.origin);
    return target.copy(this.direction).multiplyScalar(directionDistance).add(this.origin);
  }

  distanceSqToPoint(point: Vector3): number {
    const directionDistance = _v1.subVectors(point, this.origin).dot(this.direction);
    if (directionDistance < 0) return this.origin.distanceToSquared(point);
    _v1.copy(this.direction).multiplyScalar(directionDistance).add(this.origin);
    return _v1.distanceToSquared(point);
  }

  distanceSqToSegment(
    v0: Vector3,
    v1: Vector3,
    optionalPointOnRay?: Vector3,
    optionalPointOnSegment?: Vector3,
  ): number {
    _v1.subVectors(v1, v0);
    _v2.subVectors(this.origin, v0);
    const a = _v1.dot(this.direction);
    const b = _v1.dot(_v1);
    const c = _v1.dot(_v2);
    const d = this.direction.dot(_v2);
    const e = this.direction.dot(this.direction);
    const D = a * c - b * d;
    let sN = 0;
    let sD = D;
    let tN = 0;
    let tD = D;

    if (sD < 1e-12) {
      sN = 0;
      sD = 1;
      tN = d;
      tD = e;
    } else {
      sN = a * d - b * c;
      if (sN < 0) {
        sN = 0;
        tN = d;
        tD = e;
      } else if (sN > sD) {
        sN = sD;
        tN = d + a;
        tD = e;
      }
    }

    if (tN < 0) {
      tN = 0;
      if (-c < 0) sN = 0;
      else if (-c > a) sN = sD;
      else {
        sN = -c;
        sD = a;
      }
    } else if (tN > tD) {
      tN = tD;
      if (-c + a < 0) sN = 0;
      else if (-c + a > a) sN = sD;
      else {
        sN = -c + a;
        sD = a;
      }
    }

    const sc = Math.abs(sN) < 1e-12 ? 0 : sN / sD;
    const tc = Math.abs(tN) < 1e-12 ? 0 : tN / tD;

    const pointOnRay = _v1.copy(this.direction).multiplyScalar(sc).add(this.origin);
    const pointOnSegment = _v2.copy(v0).addScaledVector(_v3.subVectors(v1, v0), tc);
    if (optionalPointOnRay) optionalPointOnRay.copy(pointOnRay);
    if (optionalPointOnSegment) optionalPointOnSegment.copy(pointOnSegment);
    return pointOnRay.distanceToSquared(pointOnSegment);
  }

  intersectSphere(sphere: Sphere, target = new Vector3()): Vector3 | null {
    _v1.subVectors(sphere.center, this.origin);
    const tca = _v1.dot(this.direction);
    const d2 = _v1.dot(_v1) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return null;
    const thc = Math.sqrt(radius2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;
    if (t1 < 0) return null;
    return t0 < 0 ? this.at(t1, target) : this.at(t0, target);
  }

  intersectsSphere(sphere: Sphere): boolean {
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }

  intersectBox(box: Box3, target = new Vector3()): Vector3 | null {
    const tmin = (box.min.x - this.origin.x) / this.direction.x;
    const tmax = (box.max.x - this.origin.x) / this.direction.x;
    let t1 = Math.min(tmin, tmax);
    let t2 = Math.max(tmin, tmax);

    const tymin = (box.min.y - this.origin.y) / this.direction.y;
    const tymax = (box.max.y - this.origin.y) / this.direction.y;
    t1 = Math.max(t1, Math.min(tymin, tymax));
    t2 = Math.min(t2, Math.max(tymin, tymax));

    const tzmin = (box.min.z - this.origin.z) / this.direction.z;
    const tzmax = (box.max.z - this.origin.z) / this.direction.z;
    t1 = Math.max(t1, Math.min(tzmin, tzmax));
    t2 = Math.min(t2, Math.max(tzmin, tzmax));

    if (t2 < 0 || t1 > t2) return null;
    return t1 < 0 ? this.at(t2, target) : this.at(t1, target);
  }

  intersectsBox(box: Box3): boolean {
    return this.intersectBox(box) !== null;
  }

  intersectPlane(plane: Plane, target = new Vector3()): Vector3 | null {
    const denominator = plane.normal.dot(this.direction);
    if (denominator === 0) {
      if (plane.distanceToPoint(this.origin) === 0) return target.copy(this.origin);
      return null;
    }
    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return t >= 0 ? this.at(t, target) : null;
  }

  intersectTriangle(
    a: Vector3,
    b: Vector3,
    c: Vector3,
    backfaceCulling: boolean,
    target = new Vector3(),
  ): Vector3 | null {
    // Moller-Trumbore.
    const edge1 = _v1.subVectors(b, a);
    const edge2 = _v2.subVectors(c, a);
    _normal.crossVectors(this.direction, edge2);
    const det = edge1.dot(_normal);
    if (det < 1e-10 && backfaceCulling) return null;
    if (Math.abs(det) < 1e-10) return null;
    const invDet = 1 / det;
    const s = new Vector3().subVectors(this.origin, a);
    const u = s.dot(_normal) * invDet;
    if (u < 0 || u > 1) return null;
    const q = new Vector3().crossVectors(s, edge1);
    const v = this.direction.dot(q) * invDet;
    if (v < 0 || u + v > 1) return null;
    const t = edge2.dot(q) * invDet;
    return t >= 0 ? this.at(t, target) : null;
  }

  applyMatrix4(matrix: Matrix4): this {
    this.origin.applyMatrix4(matrix);
    this.direction.transformDirection(matrix);
    return this;
  }

  equals(ray: Ray): boolean {
    return ray.origin.equals(this.origin) && ray.direction.equals(this.direction);
  }
}
