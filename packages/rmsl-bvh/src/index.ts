export { Vector2 } from "./math/Vector2";
export { Vector3 } from "./math/Vector3";
export { Vector4 } from "./math/Vector4";
export { Box3 } from "./math/Box3";
export { Sphere } from "./math/Sphere";
export { Plane } from "./math/Plane";
export { Line3, closestPointsSegmentToSegment } from "./math/Line3";
export { Ray } from "./math/Ray";
export { Triangle } from "./math/Triangle";
export { ExtendedTriangle } from "./math/ExtendedTriangle";
export { SeparatingAxisBounds } from "./math/SeparatingAxisBounds";

export { MeshBVH, CENTER, AVERAGE, SAH } from "./core/MeshBVH";
export type {
  MeshBVHOptions,
  MeshBVHFace,
  MeshBVHIntersection,
  BvhCastCallbacks,
  ShapeCastCallbacks,
  IntersectsTrianglesCallback,
} from "./core/MeshBVH";

export { computeBoundsTree, disposeBoundsTree, computeBoundingBox } from "./extensions";
