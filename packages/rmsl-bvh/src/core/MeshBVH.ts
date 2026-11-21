import { Side } from "@random-mesh/rmsl/scene";
import type { BufferGeometry, Material } from "@random-mesh/rmsl/scene";
import { Box3 } from "../math/Box3";
import { ExtendedTriangle } from "../math/ExtendedTriangle";
import { Line3 } from "../math/Line3";
import { Plane } from "../math/Plane";
import { Ray } from "../math/Ray";
import { Sphere } from "../math/Sphere";
import { Triangle } from "../math/Triangle";
import { Vector3 } from "../math/Vector3";

/** Split strategies accepted by `MeshBVH`. Kept for API compatibility. */
export const CENTER = 0;
export const AVERAGE = 1;
export const SAH = 2;

export interface MeshBVHOptions {
  /** Target number of triangles per leaf. Defaults to 10. */
  targetLeafSize?: number;
  /** Maximum tree depth. Defaults to 40. */
  maxDepth?: number;
  /** Kept for API compatibility. This port always uses an indirect triangle table. */
  indirect?: boolean;
  /** Kept for API compatibility. */
  useSharedArrayBuffer?: boolean;
  /** Split strategy. This port currently always picks the median along the longest centroid axis. */
  strategy?: number;
  /** Build progress callback. */
  onProgress?: ((progress: number) => void) | null;
  /** Reserved for compatibility. */
  range?: { start: number; count: number } | null;
}

export interface MeshBVHFace {
  a: number;
  b: number;
  c: number;
  normal: Vector3;
  materialIndex: number;
}

export interface MeshBVHIntersection {
  distance: number;
  point: Vector3;
  face: MeshBVHFace;
  faceIndex: number;
  object?: unknown;
}

export interface IntersectsTrianglesCallback {
  (triangle1: ExtendedTriangle, triangle2: ExtendedTriangle, index1: number, index2: number): boolean;
}

export interface BvhCastCallbacks {
  intersectsRanges?: (
    offset1: number,
    count1: number,
    offset2: number,
    count2: number,
    depth1: number,
    node1: number,
    depth2: number,
    node2: number,
  ) => boolean;
  intersectsTriangles?: IntersectsTrianglesCallback;
}

export interface ShapeCastCallbacks {
  intersectsBounds?: (box: Box3, isLeaf: boolean, depth: number, nodeIndex: number) => boolean | number;
  intersectsTriangle?: (triangle: Triangle, triangleIndex: number, contained: boolean, depth: number) => boolean | void;
  traverseBoundsOrder?: (box1: Box3, box2: Box3) => number;
}

interface BVHNode {
  bounds: Box3;
  left: BVHNode | null;
  right: BVHNode | null;
  offset: number;
  count: number;
  depth: number;
}

interface TriangleBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  cx: number;
  cy: number;
  cz: number;
}

const _triangle = new Triangle();
const _box = new Box3();
const _min = new Vector3();
const _max = new Vector3();

function getTriCount(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)) / 3;
}

function ensureIndex(geometry: BufferGeometry): void {
  if (geometry.index) return;
  const vertexCount = geometry.attributes.position.count;
  const index = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) index[i] = i;
  geometry.setIndex(index);
}

function getTriangleIndices(geometry: BufferGeometry, triIndex: number): [number, number, number] {
  const index = geometry.index!;
  const i3 = triIndex * 3;
  return [index.getX(i3), index.getX(i3 + 1), index.getX(i3 + 2)];
}

function setTriangle(target: Triangle, geometry: BufferGeometry, triIndex: number): void {
  const [i0, i1, i2] = getTriangleIndices(geometry, triIndex);
  const position = geometry.attributes.position;
  target.a.fromBufferAttribute(position, i0);
  target.b.fromBufferAttribute(position, i1);
  target.c.fromBufferAttribute(position, i2);
}

function boundsIntersect(a: Box3, b: Box3): boolean {
  return !(
    b.max.x < a.min.x ||
    b.min.x > a.max.x ||
    b.max.y < a.min.y ||
    b.min.y > a.max.y ||
    b.max.z < a.min.z ||
    b.min.z > a.max.z
  );
}

/**
 * A bounding volume hierarchy over the triangles of an RMSL `BufferGeometry`.
 *
 * This is a focused TypeScript port of three-mesh-bvh: the tree build, ray
 * casts, shape casts and BVH-vs-BVH triangle intersection used by CSG are
 * implemented, while the rendering helpers, worker generation and WebGPU
 * shader bindings of the original are not.
 */
export class MeshBVH {
  geometry: BufferGeometry;
  readonly indirect = true;

  private _primitiveIndices: Uint32Array;
  private _primitiveBounds: TriangleBounds[];
  private _root: BVHNode;
  private _triangleCount: number;

  constructor(geometry: BufferGeometry, options: MeshBVHOptions = {}) {
    if (!(geometry as { isBufferGeometry?: boolean }).isBufferGeometry) {
      throw new Error("MeshBVH: Only BufferGeometries are supported.");
    }
    if (!geometry.attributes.position) {
      throw new Error("MeshBVH: A geometry needs a position attribute.");
    }

    ensureIndex(geometry);
    this.geometry = geometry;
    this._triangleCount = getTriCount(geometry);
    this._primitiveBounds = new Array(this._triangleCount);
    this._primitiveIndices = new Uint32Array(this._triangleCount);
    for (let i = 0; i < this._triangleCount; i++) this._primitiveIndices[i] = i;

    this.computeTriangleBounds();
    const targetLeafSize = Math.max(1, options.targetLeafSize ?? 10);
    const maxDepth = options.maxDepth ?? 40;
    let visited = 0;
    const onProgress = options.onProgress ?? null;
    const total = Math.max(1, this._triangleCount);

    const build = (offset: number, count: number, depth: number): BVHNode => {
      const bounds = new Box3();
      for (let i = offset; i < offset + count; i++) {
        const tb = this._primitiveBounds[this._primitiveIndices[i]];
        _box.set(_min.set(tb.minX, tb.minY, tb.minZ), _max.set(tb.maxX, tb.maxY, tb.maxZ));
        bounds.union(_box);
      }

      if (count <= targetLeafSize || depth >= maxDepth) {
        visited += count;
        onProgress?.(visited / total);
        return { bounds, left: null, right: null, offset, count, depth };
      }

      // Median split on the longest centroid axis.
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = offset; i < offset + count; i++) {
        const tb = this._primitiveBounds[this._primitiveIndices[i]];
        minX = Math.min(minX, tb.cx);
        minY = Math.min(minY, tb.cy);
        minZ = Math.min(minZ, tb.cz);
        maxX = Math.max(maxX, tb.cx);
        maxY = Math.max(maxY, tb.cy);
        maxZ = Math.max(maxZ, tb.cz);
      }

      const extentX = maxX - minX;
      const extentY = maxY - minY;
      const extentZ = maxZ - minZ;
      let axis: "cx" | "cy" | "cz" = "cx";
      if (extentY > extentX && extentY >= extentZ) axis = "cy";
      else if (extentZ > extentX && extentZ > extentY) axis = "cz";

      const indices = Array.from(this._primitiveIndices.subarray(offset, offset + count));
      indices.sort((a, b) => this._primitiveBounds[a][axis] - this._primitiveBounds[b][axis]);
      this._primitiveIndices.set(indices, offset);

      const mid = offset + Math.max(1, Math.floor(count / 2));
      if (mid <= offset || mid >= offset + count) {
        return { bounds, left: null, right: null, offset, count, depth };
      }

      const left = build(offset, mid - offset, depth + 1);
      const right = build(mid, offset + count - mid, depth + 1);
      return { bounds, left, right, offset, count, depth };
    };

    this._root =
      this._triangleCount === 0
        ? { bounds: new Box3().makeEmpty(), left: null, right: null, offset: 0, count: 0, depth: 0 }
        : build(0, this._triangleCount, 0);
  }

  /** Maps a BVH primitive index to the original triangle index in the geometry. */
  resolveTriangleIndex(index: number): number {
    return this._primitiveIndices[index];
  }

  /** Alias kept from three-mesh-bvh. */
  get resolvePrimitiveIndex(): (index: number) => number {
    return (index: number) => this.resolveTriangleIndex(index);
  }

  private computeTriangleBounds(): void {
    const geometry = this.geometry;
    const position = geometry.attributes.position;
    for (let i = 0; i < this._triangleCount; i++) {
      const [i0, i1, i2] = getTriangleIndices(geometry, i);
      const ax = position.getX(i0);
      const ay = position.getY(i0);
      const az = position.getZ(i0);
      const bx = position.getX(i1);
      const by = position.getY(i1);
      const bz = position.getZ(i1);
      const cx = position.getX(i2);
      const cy = position.getY(i2);
      const cz = position.getZ(i2);

      const minX = Math.min(ax, bx, cx);
      const minY = Math.min(ay, by, cy);
      const minZ = Math.min(az, bz, cz);
      const maxX = Math.max(ax, bx, cx);
      const maxY = Math.max(ay, by, cy);
      const maxZ = Math.max(az, bz, cz);

      this._primitiveBounds[i] = {
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        cz: (minZ + maxZ) / 2,
      };
    }
  }

  /** Recomputes node bounds after the geometry's positions changed. */
  refit(): void {
    const refitNode = (node: BVHNode): Box3 => {
      if (node.left === null || node.right === null) {
        const bounds = new Box3();
        for (let i = node.offset; i < node.offset + node.count; i++) {
          const ti = this._primitiveIndices[i];
          setTriangle(_triangle, this.geometry, ti);
          bounds.expandByPoint(_triangle.a);
          bounds.expandByPoint(_triangle.b);
          bounds.expandByPoint(_triangle.c);
        }
        node.bounds = bounds;
      } else {
        refitNode(node.left);
        refitNode(node.right);
        node.bounds = node.left.bounds.clone().union(node.right.bounds);
      }
      return node.bounds;
    };
    refitNode(this._root);
  }

  /** Returns the root bound box. */
  getBoundingBox(target = new Box3()): Box3 {
    return target.copy(this._root.bounds);
  }

  /** Returns a bounding sphere enclosing the whole tree. */
  getBoundingSphere(target = new Sphere()): Sphere {
    this._root.bounds.getCenter(target.center);
    const center = target.center;
    let radiusSq = 0;
    for (let i = 0; i < this._triangleCount; i++) {
      const ti = this._primitiveIndices[i];
      setTriangle(_triangle, this.geometry, ti);
      radiusSq = Math.max(
        radiusSq,
        center.distanceToSquared(_triangle.a),
        center.distanceToSquared(_triangle.b),
        center.distanceToSquared(_triangle.c),
      );
    }
    target.radius = Math.sqrt(radiusSq);
    return target;
  }

  private sideFor(materialOrSide: number | Material | Material[]): Side {
    if (typeof materialOrSide === "number") return materialOrSide as Side;
    if (Array.isArray(materialOrSide)) return materialOrSide[0]?.side ?? Side.FrontSide;
    return materialOrSide.side ?? Side.FrontSide;
  }

  /**
   * Casts a ray against every triangle and returns each hit, closest first.
   * The ray is in the geometry's local frame.
   */
  raycast(
    ray: Ray,
    materialOrSide: number | Material | Material[] = Side.FrontSide,
    near = 0,
    far = Infinity,
  ): MeshBVHIntersection[] {
    const side = this.sideFor(materialOrSide);
    const hits: MeshBVHIntersection[] = [];
    const backfaceCulling = side === Side.FrontSide;
    const frontfaceCulling = side === Side.BackSide;

    const testTriangle = (triIndex: number): void => {
      setTriangle(_triangle, this.geometry, triIndex);
      const point = ray.intersectTriangle(_triangle.a, _triangle.b, _triangle.c, backfaceCulling, new Vector3());
      if (point === null) return;

      const distance = ray.origin.distanceTo(point);
      if (distance < near || distance > far) return;

      const normal = _triangle.getNormal(new Vector3());
      if (backfaceCulling && normal.dot(ray.direction) > 0) return;
      if (frontfaceCulling && normal.dot(ray.direction) < 0) return;

      hits.push({
        distance,
        point,
        face: { a: 0, b: 1, c: 2, normal, materialIndex: 0 },
        faceIndex: triIndex,
      });
    };

    if (this._triangleCount !== 0) {
      const stack: BVHNode[] = [this._root];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (!ray.intersectsBox(node.bounds)) continue;
        if (node.left === null || node.right === null) {
          for (let i = node.offset; i < node.offset + node.count; i++) {
            testTriangle(this._primitiveIndices[i]);
          }
        } else {
          stack.push(node.left, node.right);
        }
      }
    }

    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  /** Casts a ray and returns only the closest hit. */
  raycastFirst(
    ray: Ray,
    materialOrSide: number | Material | Material[] = Side.FrontSide,
    near = 0,
    far = Infinity,
  ): MeshBVHIntersection | null {
    const side = this.sideFor(materialOrSide);
    const backfaceCulling = side === Side.FrontSide;
    const frontfaceCulling = side === Side.BackSide;
    let closest: MeshBVHIntersection | null = null;

    const testTriangle = (triIndex: number): void => {
      setTriangle(_triangle, this.geometry, triIndex);
      const point = ray.intersectTriangle(_triangle.a, _triangle.b, _triangle.c, backfaceCulling, new Vector3());
      if (point === null) return;

      const distance = ray.origin.distanceTo(point);
      if (distance < near || distance > far) return;
      if (closest !== null && distance >= closest.distance) return;

      const normal = _triangle.getNormal(new Vector3());
      if (backfaceCulling && normal.dot(ray.direction) > 0) return;
      if (frontfaceCulling && normal.dot(ray.direction) < 0) return;

      closest = {
        distance,
        point,
        face: { a: 0, b: 1, c: 2, normal, materialIndex: 0 },
        faceIndex: triIndex,
      };
    };

    if (this._triangleCount !== 0) {
      const stack: BVHNode[] = [this._root];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (!ray.intersectsBox(node.bounds)) continue;
        if (node.left === null || node.right === null) {
          for (let i = node.offset; i < node.offset + node.count; i++) {
            testTriangle(this._primitiveIndices[i]);
          }
        } else {
          stack.push(node.left, node.right);
        }
      }
    }

    return closest;
  }

  /** Traverses the tree, visiting bounds and triangles through callbacks. */
  shapecast(callbacks: ShapeCastCallbacks): boolean {
    const { intersectsBounds, intersectsTriangle, traverseBoundsOrder } = callbacks;

    const visit = (node: BVHNode, contained: boolean, depth: number, nodeIndex: number): boolean => {
      if (intersectsBounds) {
        const result = intersectsBounds(node.bounds, node.left === null, depth, nodeIndex);
        if (result === false) return false;
        if (result === 2) contained = true;
      }

      if (node.left === null || node.right === null) {
        if (intersectsTriangle) {
          for (let i = node.offset; i < node.offset + node.count; i++) {
            const triIndex = this._primitiveIndices[i];
            setTriangle(_triangle, this.geometry, triIndex);
            if (intersectsTriangle(_triangle, triIndex, contained, depth)) return true;
          }
        }
        return false;
      }

      let first = node.left;
      let second = node.right;
      if (traverseBoundsOrder && traverseBoundsOrder(first.bounds, second.bounds) < 0) {
        first = node.right;
        second = node.left;
      }

      if (visit(first, contained, depth + 1, nodeIndex * 2 + 1)) return true;
      if (visit(second, contained, depth + 1, nodeIndex * 2 + 2)) return true;
      return false;
    };

    return this._triangleCount === 0 ? false : visit(this._root, false, 0, 0);
  }

  /**
   * Traverses two trees together. `matrixToLocal` transforms `otherBvh`'s
   * triangles into this BVH's local frame before they are tested.
   */
  bvhcast(
    otherBvh: MeshBVH,
    matrixToLocal: import("@random-mesh/rmsl/scene").Matrix4,
    callbacks: BvhCastCallbacks,
  ): boolean {
    const { intersectsRanges, intersectsTriangles } = callbacks;

    const transformBox = (box: Box3): Box3 => box.clone().applyMatrix4(matrixToLocal);

    const triangle1 = new ExtendedTriangle();
    const triangle2 = new ExtendedTriangle();

    const runRanges = (
      node1: BVHNode,
      node2: BVHNode,
      depth1: number,
      depth2: number,
      nodeIndex1: number,
      nodeIndex2: number,
    ): boolean => {
      if (!intersectsRanges) return false;
      return intersectsRanges(
        node1.offset,
        node1.count,
        node2.offset,
        node2.count,
        depth1,
        nodeIndex1,
        depth2,
        nodeIndex2,
      );
    };

    const runTriangles = (
      node1: BVHNode,
      node2: BVHNode,
      depth1: number,
      depth2: number,
      nodeIndex1: number,
      nodeIndex2: number,
    ): boolean => {
      if (!intersectsTriangles) return runRanges(node1, node2, depth1, depth2, nodeIndex1, nodeIndex2);

      for (let i2 = node2.offset; i2 < node2.offset + node2.count; i2++) {
        const ti2 = otherBvh._primitiveIndices[i2];
        setTriangle(triangle2, otherBvh.geometry, ti2);
        triangle2.a.applyMatrix4(matrixToLocal);
        triangle2.b.applyMatrix4(matrixToLocal);
        triangle2.c.applyMatrix4(matrixToLocal);
        triangle2.needsUpdate = true;

        for (let i1 = node1.offset; i1 < node1.offset + node1.count; i1++) {
          const ti1 = this._primitiveIndices[i1];
          setTriangle(triangle1, this.geometry, ti1);
          triangle1.needsUpdate = true;

          if (intersectsTriangles(triangle1, triangle2, i1, i2)) return true;
        }
      }

      return false;
    };

    const recurse = (
      node1: BVHNode,
      node2: BVHNode,
      depth1: number,
      depth2: number,
      nodeIndex1: number,
      nodeIndex2: number,
    ): boolean => {
      if (!boundsIntersect(node1.bounds, transformBox(node2.bounds))) return false;

      const isLeaf1 = node1.left === null;
      const isLeaf2 = node2.left === null;
      if (isLeaf1 && isLeaf2) {
        return runTriangles(node1, node2, depth1, depth2, nodeIndex1, nodeIndex2);
      }

      if (isLeaf1) {
        return (
          recurse(node1, node2.left!, depth1, depth2 + 1, nodeIndex1, nodeIndex2 * 2 + 1) ||
          recurse(node1, node2.right!, depth1, depth2 + 1, nodeIndex1, nodeIndex2 * 2 + 2)
        );
      }

      if (isLeaf2) {
        return (
          recurse(node1.left!, node2, depth1 + 1, depth2, nodeIndex1 * 2 + 1, nodeIndex2) ||
          recurse(node1.right!, node2, depth1 + 1, depth2, nodeIndex1 * 2 + 2, nodeIndex2)
        );
      }

      return (
        recurse(node1.left!, node2.left!, depth1 + 1, depth2 + 1, nodeIndex1 * 2 + 1, nodeIndex2 * 2 + 1) ||
        recurse(node1.left!, node2.right!, depth1 + 1, depth2 + 1, nodeIndex1 * 2 + 1, nodeIndex2 * 2 + 2) ||
        recurse(node1.right!, node2.left!, depth1 + 1, depth2 + 1, nodeIndex1 * 2 + 2, nodeIndex2 * 2 + 1) ||
        recurse(node1.right!, node2.right!, depth1 + 1, depth2 + 1, nodeIndex1 * 2 + 2, nodeIndex2 * 2 + 2)
      );
    };

    return this._triangleCount === 0 || otherBvh._triangleCount === 0
      ? false
      : recurse(this._root, otherBvh._root, 0, 0, 0, 0);
  }

  /** Finds the closest point on the mesh to `point`. */
  closestPointToPoint(
    point: Vector3,
    target: { point: Vector3; distance: number; faceIndex: number } = {
      point: new Vector3(),
      distance: 0,
      faceIndex: 0,
    },
    minThreshold = 0,
    maxThreshold = Infinity,
  ): { point: Vector3; distance: number; faceIndex: number } {
    let best = maxThreshold;
    const closest = new Vector3();
    const visit = (node: BVHNode): void => {
      if (node.bounds.distanceToPoint(point) >= best) return;
      if (node.left === null) {
        for (let i = node.offset; i < node.offset + node.count; i++) {
          const triIndex = this._primitiveIndices[i];
          setTriangle(_triangle, this.geometry, triIndex);
          _triangle.closestPointToPoint(point, closest);
          const distance = closest.distanceTo(point);
          if (distance < best && distance >= minThreshold) {
            best = distance;
            target.point.copy(closest);
            target.distance = distance;
            target.faceIndex = triIndex;
          }
        }
      } else {
        const leftDistance = node.left.bounds.distanceToPoint(point);
        const rightDistance = node.right!.bounds.distanceToPoint(point);
        if (leftDistance < rightDistance) {
          visit(node.left);
          visit(node.right!);
        } else {
          visit(node.right!);
          visit(node.left);
        }
      }
    };
    if (this._triangleCount !== 0) visit(this._root);
    return target;
  }

  /** Returns whether the mesh intersects the given box. */
  intersectsBox(box: Box3, boxToMesh: import("@random-mesh/rmsl/scene").Matrix4): boolean {
    const transformed = box.clone().applyMatrix4(boxToMesh);
    return this.shapecast({
      intersectsBounds: (nodeBounds) => nodeBounds.intersectsBox(transformed),
      intersectsTriangle: () => true,
    });
  }

  /** Returns whether the mesh intersects the given sphere. */
  intersectsSphere(sphere: Sphere): boolean {
    return this.shapecast({
      intersectsBounds: (nodeBounds) => nodeBounds.intersectsSphere(sphere),
      intersectsTriangle: (triangle) => sphereIntersectsTriangle(sphere, triangle),
    });
  }
}

const _sphereClosest = new Vector3();
const _sphereLine = new Line3();

function sphereIntersectsTriangle(sphere: Sphere, triangle: Triangle): boolean {
  _sphereLine.set(triangle.a, triangle.b);
  _sphereLine.closestPointToPoint(sphere.center, true, _sphereClosest);
  if (_sphereClosest.distanceTo(sphere.center) <= sphere.radius) return true;

  _sphereLine.set(triangle.b, triangle.c);
  _sphereLine.closestPointToPoint(sphere.center, true, _sphereClosest);
  if (_sphereClosest.distanceTo(sphere.center) <= sphere.radius) return true;

  _sphereLine.set(triangle.c, triangle.a);
  _sphereLine.closestPointToPoint(sphere.center, true, _sphereClosest);
  if (_sphereClosest.distanceTo(sphere.center) <= sphere.radius) return true;

  const normal = triangle.getNormal(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, triangle.a);
  const projected = plane.projectPoint(sphere.center, new Vector3());
  return triangle.containsPoint(projected) && projected.distanceTo(sphere.center) <= sphere.radius;
}

export { getTriCount };
