import { Vector3 as RmslVector3 } from "@random-mesh/rmsl/scene";
import type { BufferAttribute, Matrix3, Matrix4 } from "@random-mesh/rmsl/scene";

/**
 * A `Vector3` with the handful of helpers from three.js that the BVH and CSG
 * code relies on but RMSL's scene math does not expose. It extends the RMSL
 * `Vector3`, so it is accepted anywhere the scene expects one.
 */
export class Vector3 extends RmslVector3 {
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /** Reads three components from a `BufferAttribute` at `index`. */
  fromBufferAttribute(attribute: BufferAttribute, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }

  addScaledVector(v: Vector3, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  addVectors(a: Vector3, b: Vector3): this {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  lerpVectors(a: Vector3, b: Vector3, t: number): this {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }

  /** The angle between this vector and `v`, in radians. */
  angleTo(v: Vector3): number {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(Math.min(1, Math.max(-1, theta)));
  }

  /** Applies a normal matrix (inverse-transpose) and normalizes the result. */
  applyNormalMatrix(m: Matrix3): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this.normalize();
  }

  /** Sets the length of this vector from the scale of a matrix. */
  setFromMatrixScale(m: Matrix4): this {
    const e = m.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const sz = Math.hypot(e[8], e[9], e[10]);
    return this.set(sx, sy, sz);
  }

  /** Clamps the length of this vector to at most `max`. */
  clampLength(max: number): this {
    const length = this.length();
    return this.divideScalar(length > max ? length / max : 1);
  }
}
