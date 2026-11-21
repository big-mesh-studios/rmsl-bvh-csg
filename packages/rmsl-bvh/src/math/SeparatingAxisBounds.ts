import { Vector3 } from "./Vector3";

/** The projection interval of a set of points on an axis, as used by SAT. */
export class SeparatingAxisBounds {
  min = Infinity;
  max = -Infinity;

  setFromPointsField(points: Vector3[], field: "x" | "y" | "z"): void {
    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      const value = point[field];
      min = value < min ? value : min;
      max = value > max ? value : max;
    }
    this.min = min;
    this.max = max;
  }

  setFromPoints(axis: Vector3, points: Vector3[]): void {
    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      const value = axis.dot(point);
      min = value < min ? value : min;
      max = value > max ? value : max;
    }
    this.min = min;
    this.max = max;
  }

  isSeparated(other: SeparatingAxisBounds): boolean {
    return this.min > other.max || other.min > this.max;
  }
}
