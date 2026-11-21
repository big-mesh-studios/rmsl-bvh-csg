import type { Matrix4 } from "@random-mesh/rmsl/scene";
import { Line3 } from "./Line3";
import { Vector3 } from "./Vector3";

const _vector1 = new Vector3();
const _vector2 = new Vector3();
const _normalMatrix = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };

/** An infinite plane, matching the part of three.js's `Plane` the BVH uses. */
export class Plane {
  normal: Vector3;
  constant: number;

  constructor(normal = new Vector3(0, 0, 1), constant = 0) {
    this.normal = normal;
    this.constant = constant;
  }

  set(normal: Vector3, constant: number): this {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }

  setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  copy(plane: Plane): this {
    this.normal.copy(plane.normal);
    this.constant = plane.constant;
    return this;
  }

  clone(): Plane {
    return new Plane(this.normal.clone(), this.constant);
  }

  normalize(): this {
    const inverseNormalLength = 1 / this.normal.length();
    this.normal.multiplyScalar(inverseNormalLength);
    this.constant *= inverseNormalLength;
    return this;
  }

  setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): this {
    this.normal.copy(normal).normalize();
    this.constant = -point.dot(this.normal);
    return this;
  }

  setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): this {
    const normal = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();
    return this.setFromNormalAndCoplanarPoint(normal, a);
  }

  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant;
  }

  projectPoint(point: Vector3, target = new Vector3()): Vector3 {
    return target.copy(point).addScaledVector(this.normal, -this.distanceToPoint(point));
  }

  coplanarPoint(target = new Vector3()): Vector3 {
    return target.copy(this.normal).multiplyScalar(-this.constant);
  }

  intersectLine(line: Line3, target = new Vector3()): Vector3 | null {
    const direction = _vector1;
    const denominator = line.delta(direction).dot(this.normal);
    if (denominator === 0) {
      // line is coplanar, return origin
      if (this.distanceToPoint(line.start) === 0) return target.copy(line.start);
      return null;
    }

    const t = -(line.start.dot(this.normal) + this.constant) / denominator;
    if (t < 0 || t > 1) return null;
    return target.copy(line.start).addScaledVector(direction, t);
  }

  applyMatrix4(matrix: Matrix4): this {
    const e = matrix.elements;
    // Normal matrix without relying on the full Matrix3 path.
    const nm = _normalMatrix.elements;
    nm[0] = e[0];
    nm[1] = e[1];
    nm[2] = e[2];
    nm[3] = e[4];
    nm[4] = e[5];
    nm[5] = e[6];
    nm[6] = e[8];
    nm[7] = e[9];
    nm[8] = e[10];
    this.normal.set(
      nm[0] * this.normal.x + nm[3] * this.normal.y + nm[6] * this.normal.z,
      nm[1] * this.normal.x + nm[4] * this.normal.y + nm[7] * this.normal.z,
      nm[2] * this.normal.x + nm[5] * this.normal.y + nm[8] * this.normal.z,
    );
    const point = this.coplanarPoint(_vector1).applyMatrix4(matrix);
    this.constant = -point.dot(this.normal);
    return this;
  }

  translate(offset: Vector3): this {
    this.constant -= offset.dot(this.normal);
    return this;
  }
}
