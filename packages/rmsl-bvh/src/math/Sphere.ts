import type { Matrix4 } from "@random-mesh/rmsl/scene";
import { Box3 } from "./Box3";
import { Vector3 } from "./Vector3";

/** A bounding sphere, matching the part of three.js's `Sphere` the BVH uses. */
export class Sphere {
  center: Vector3;
  radius: number;

  constructor(center = new Vector3(), radius = -1) {
    this.center = center;
    this.radius = radius;
  }

  set(center: Vector3, radius: number): this {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }

  copy(sphere: Sphere): this {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }

  clone(): Sphere {
    return new Sphere(this.center.clone(), this.radius);
  }

  makeEmpty(): this {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }

  isEmpty(): boolean {
    return this.radius < 0;
  }

  setFromPoints(points: Vector3[]): this {
    const center = this.center;
    if (points.length === 0) {
      center.set(0, 0, 0);
      this.radius = -1;
      return this;
    }

    const box = new Box3().setFromPoints(points);
    box.getCenter(center);
    let maxRadiusSq = 0;
    for (const point of points) maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(point));
    this.radius = Math.sqrt(maxRadiusSq);
    return this;
  }

  containsPoint(point: Vector3): boolean {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  distanceToPoint(point: Vector3): number {
    return point.distanceTo(this.center) - this.radius;
  }

  intersectsSphere(sphere: Sphere): boolean {
    return sphere.center.distanceToSquared(this.center) <= (this.radius + sphere.radius) ** 2;
  }

  intersectsBox(box: Box3): boolean {
    const target = new Vector3();
    box.clampPoint(this.center, target);
    return target.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  applyMatrix4(matrix: Matrix4): this {
    this.center.applyMatrix4(matrix);
    const e = matrix.elements;
    const scale = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    this.radius *= scale;
    return this;
  }
}
