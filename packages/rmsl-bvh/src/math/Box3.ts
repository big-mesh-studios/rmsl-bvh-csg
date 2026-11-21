import type { BufferAttribute, Matrix4 } from "@random-mesh/rmsl/scene";
import { Vector3 } from "./Vector3";

const _points = [
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
];

/** An axis-aligned bounding box, matching the part of three.js's `Box3` the BVH uses. */
export class Box3 {
  min: Vector3;
  max: Vector3;

  constructor(min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }

  set(min: Vector3, max: Vector3): this {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  copy(box: Box3): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  clone(): Box3 {
    return new Box3(this.min.clone(), this.max.clone());
  }

  makeEmpty(): this {
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }

  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  setFromPoints(points: Vector3[]): this {
    this.makeEmpty();
    for (const point of points) this.expandByPoint(point);
    return this;
  }

  setFromBufferAttribute(attribute: BufferAttribute): this {
    this.makeEmpty();
    for (let i = 0; i < attribute.count; i++) {
      _points[0].fromBufferAttribute(attribute, i);
      this.expandByPoint(_points[0]);
    }
    return this;
  }

  expandByPoint(point: Vector3): this {
    this.min.x = Math.min(this.min.x, point.x);
    this.min.y = Math.min(this.min.y, point.y);
    this.min.z = Math.min(this.min.z, point.z);
    this.max.x = Math.max(this.max.x, point.x);
    this.max.y = Math.max(this.max.y, point.y);
    this.max.z = Math.max(this.max.z, point.z);
    return this;
  }

  expandByVector(vector: Vector3): this {
    this.min.x -= vector.x;
    this.min.y -= vector.y;
    this.min.z -= vector.z;
    this.max.x += vector.x;
    this.max.y += vector.y;
    this.max.z += vector.z;
    return this;
  }

  expandByScalar(scalar: number): this {
    this.min.x -= scalar;
    this.min.y -= scalar;
    this.min.z -= scalar;
    this.max.x += scalar;
    this.max.y += scalar;
    this.max.z += scalar;
    return this;
  }

  union(box: Box3): this {
    this.min.x = Math.min(this.min.x, box.min.x);
    this.min.y = Math.min(this.min.y, box.min.y);
    this.min.z = Math.min(this.min.z, box.min.z);
    this.max.x = Math.max(this.max.x, box.max.x);
    this.max.y = Math.max(this.max.y, box.max.y);
    this.max.z = Math.max(this.max.z, box.max.z);
    return this;
  }

  applyMatrix4(matrix: Matrix4): this {
    // transform the eight corners and rebuild the box
    const { min, max } = this;
    const points = _points;
    points[0].set(min.x, min.y, min.z);
    points[1].set(min.x, min.y, max.z);
    points[2].set(min.x, max.y, min.z);
    points[3].set(min.x, max.y, max.z);
    points[4].set(max.x, min.y, min.z);
    points[5].set(max.x, min.y, max.z);
    points[6].set(max.x, max.y, min.z);
    points[7].set(max.x, max.y, max.z);
    for (const point of points) point.applyMatrix4(matrix);
    this.setFromPoints(points);
    return this;
  }

  getCenter(target = new Vector3()): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  getSize(target = new Vector3()): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }

  containsPoint(point: Vector3): boolean {
    return (
      point.x >= this.min.x &&
      point.x <= this.max.x &&
      point.y >= this.min.y &&
      point.y <= this.max.y &&
      point.z >= this.min.z &&
      point.z <= this.max.z
    );
  }

  intersectsBox(box: Box3): boolean {
    return !(
      box.max.x < this.min.x ||
      box.min.x > this.max.x ||
      box.max.y < this.min.y ||
      box.min.y > this.max.y ||
      box.max.z < this.min.z ||
      box.min.z > this.max.z
    );
  }

  intersectsSphere(sphere: { center: Vector3; radius: number }): boolean {
    const closest = this.clampPoint(sphere.center, new Vector3());
    return closest.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  distanceToPoint(point: Vector3): number {
    return this.clampPoint(point, new Vector3()).distanceTo(point);
  }

  clampPoint(point: Vector3, target = new Vector3()): Vector3 {
    return target.set(
      Math.max(this.min.x, Math.min(this.max.x, point.x)),
      Math.max(this.min.y, Math.min(this.max.y, point.y)),
      Math.max(this.min.z, Math.min(this.max.z, point.z)),
    );
  }
}
