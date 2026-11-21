import type { Ray, Vector2, Vector3, Vector4 } from "@random-mesh/rmsl-bvh";

const HASH_WIDTH = 1e-6;
const HASH_HALF_WIDTH = HASH_WIDTH * 0.5;
const HASH_MULTIPLIER = Math.pow(10, -Math.log10(HASH_WIDTH));
const HASH_ADDITION = HASH_HALF_WIDTH * HASH_MULTIPLIER;

export function hashNumber(v: number): number {
  return ~~(v * HASH_MULTIPLIER + HASH_ADDITION);
}

export function hashVertex2(v: Vector2): string {
  return `${hashNumber(v.x)},${hashNumber(v.y)}`;
}

export function hashVertex3(v: Vector3): string {
  return `${hashNumber(v.x)},${hashNumber(v.y)},${hashNumber(v.z)}`;
}

export function hashVertex4(v: Vector4): string {
  return `${hashNumber(v.x)},${hashNumber(v.y)},${hashNumber(v.z)},${hashNumber(v.w)}`;
}

export function hashRay(r: Ray): string {
  return `${hashVertex3(r.origin)}-${hashVertex3(r.direction)}`;
}

export function toNormalizedRay(v0: Vector3, v1: Vector3, target: Ray): Ray {
  target.direction.subVectors(v1, v0).normalize();

  // project the origin onto the perpendicular plane that passes through
  // the world origin to make rays with the same line hash equally.
  const dot = v0.dot(target.direction);
  target.origin.copy(v0).addScaledVector(target.direction, -dot);

  return target;
}
