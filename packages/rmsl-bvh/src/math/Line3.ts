import type { Matrix4 } from "@random-mesh/rmsl/scene";
import { Vector3 } from "./Vector3";

const _startP = new Vector3();
const _startEnd = new Vector3();

/**
 * Returns the parameters along two infinite lines at their closest points.
 * Ported from three-mesh-bvh's `closestPointLineToLine`.
 */
export function closestPointLineToLine(
  line1: { start: Vector3; end: Vector3 },
  line2: { start: Vector3; end: Vector3 },
  result: { x: number; y: number },
): void {
  const d1 = new Vector3().subVectors(line1.end, line1.start);
  const d2 = new Vector3().subVectors(line2.end, line2.start);
  const r = new Vector3().subVectors(line1.start, line2.start);

  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);

  let s: number;
  let t: number;

  if (a <= 1e-8 && e <= 1e-8) {
    s = 0;
    t = 0;
  } else if (a <= 1e-8) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1.dot(r);
    if (e <= 1e-8) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }

  result.x = s;
  result.y = t;
}

/** A line segment, matching the part of three.js's `Line3` the BVH and CSG use. */
export class Line3 {
  start: Vector3;
  end: Vector3;

  constructor(start = new Vector3(), end = new Vector3()) {
    this.start = start;
    this.end = end;
  }

  set(start: Vector3, end: Vector3): this {
    this.start.copy(start);
    this.end.copy(end);
    return this;
  }

  copy(line: Line3): this {
    this.start.copy(line.start);
    this.end.copy(line.end);
    return this;
  }

  clone(): Line3 {
    return new Line3(this.start.clone(), this.end.clone());
  }

  getCenter(target = new Vector3()): Vector3 {
    return target.addVectors(this.start, this.end).multiplyScalar(0.5);
  }

  delta(target = new Vector3()): Vector3 {
    return target.subVectors(this.end, this.start);
  }

  distanceSq(): number {
    return this.start.distanceToSquared(this.end);
  }

  distance(): number {
    return this.start.distanceTo(this.end);
  }

  at(t: number, target = new Vector3()): Vector3 {
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  closestPointToPointParameter(point: Vector3, clampToLine = true): number {
    _startP.subVectors(point, this.start);
    _startEnd.subVectors(this.end, this.start);
    const startEnd2 = _startEnd.dot(_startEnd);
    const startEndStartP = _startEnd.dot(_startP);
    let t = startEndStartP / startEnd2;
    if (clampToLine) t = Math.max(0, Math.min(1, t));
    return t;
  }

  closestPointToPoint(point: Vector3, clampToLine = true, target = new Vector3()): Vector3 {
    return this.at(this.closestPointToPointParameter(point, clampToLine), target);
  }

  distanceSqToPoint(point: Vector3): number {
    return this.closestPointToPoint(point, true, new Vector3()).distanceToSquared(point);
  }

  closestPointToSegment(point: Vector3, clampToLine = true, target = new Vector3()): Vector3 {
    return this.closestPointToPoint(point, clampToLine, target);
  }

  distanceSqToSegment(segment: Line3, target1?: Vector3, target2?: Vector3): number {
    closestPointsSegmentToSegment(this, segment, target1 ?? null, target2 ?? null);
    if (target1 && target2) return target1.distanceToSquared(target2);
    // Fall back to computing the closest points into temporaries when callers only want the distance.
    const a = new Vector3();
    const b = new Vector3();
    closestPointsSegmentToSegment(this, segment, a, b);
    return a.distanceToSquared(b);
  }

  distanceSqToLine3(line: Line3, outA?: Vector3, outB?: Vector3): number {
    return this.distanceSqToSegment(line, outA, outB);
  }

  applyMatrix4(matrix: Matrix4): this {
    this.start.applyMatrix4(matrix);
    this.end.applyMatrix4(matrix);
    return this;
  }

  equals(line: Line3): boolean {
    return line.start.equals(this.start) && line.end.equals(this.end);
  }
}

const _l1 = new Vector3();
const _l2 = new Vector3();
const _param = { x: 0, y: 0 };

/**
 * Writes the closest points between two segments into `target1` and `target2`.
 * Ported from three-mesh-bvh's `closestPointsSegmentToSegment`.
 */
export function closestPointsSegmentToSegment(
  l1: Line3,
  l2: Line3,
  target1: Vector3 | null,
  target2: Vector3 | null,
): void {
  closestPointLineToLine(l1, l2, _param);

  const d = _param.x;
  const d2 = _param.y;
  const out1 = target1 ?? _l1;
  const out2 = target2 ?? _l2;

  if (d >= 0 && d <= 1 && d2 >= 0 && d2 <= 1) {
    l1.at(d, out1);
    l2.at(d2, out2);
    return;
  } else if (d >= 0 && d <= 1) {
    if (d2 < 0) l2.at(0, out2);
    else l2.at(1, out2);
    l1.closestPointToPoint(out2, true, out1);
    return;
  } else if (d2 >= 0 && d2 <= 1) {
    if (d < 0) l1.at(0, out1);
    else l1.at(1, out1);
    l2.closestPointToPoint(out1, true, out2);
    return;
  }

  const p = d < 0 ? l1.start : l1.end;
  const p2 = d2 < 0 ? l2.start : l2.end;
  const temp1 = new Vector3();
  const temp2 = new Vector3();
  l1.closestPointToPoint(p2, true, temp1);
  l2.closestPointToPoint(p, true, temp2);

  if (temp1.distanceToSquared(p2) <= temp2.distanceToSquared(p)) {
    out1.copy(temp1);
    out2.copy(p2);
  } else {
    out1.copy(p);
    out2.copy(temp2);
  }
}
