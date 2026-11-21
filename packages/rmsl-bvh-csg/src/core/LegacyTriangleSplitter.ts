import { ExtendedTriangle, Line3, Plane, Triangle, Vector3 } from "@random-mesh/rmsl-bvh";
import { isTriDegenerate } from "./utils/triangleUtils";
import { Pool } from "./utils/Pool";

const EPSILON = 1e-10;
const COPLANAR_EPSILON = 1e-10;
const _edge = new Line3();
const _foundEdge = new Line3();
const _vec = new Vector3();
const _triangleNormal = new Vector3();
const _planeNormal = new Vector3();
const _plane = new Plane();
const _splittingTriangle = new ExtendedTriangle();

/**
 * The original triangle splitter: splits triangles by the planes of the
 * intersecting triangles. Simpler than the CDT splitter, but can produce
 * long, thin triangles.
 */
export class LegacyTriangleSplitter {
  trianglePool = new Pool<Triangle>(() => new Triangle());
  triangles: Triangle[] = [];
  normal = new Vector3();

  initialize(tri: Triangle | Triangle[]): void {
    this.reset();

    const { triangles, trianglePool, normal } = this;
    if (Array.isArray(tri)) {
      for (let i = 0, l = tri.length; i < l; i++) {
        const t = tri[i];
        if (i === 0) {
          t.getNormal(normal);
        } else if (Math.abs(1.0 - t.getNormal(_vec).dot(normal)) > EPSILON) {
          throw new Error("Triangle Splitter: Cannot initialize with triangles that have different normals.");
        }

        const poolTri = trianglePool.getInstance();
        poolTri.copy(t);
        triangles.push(poolTri);
      }
    } else {
      tri.getNormal(normal);
      const poolTri = trianglePool.getInstance();
      poolTri.copy(tri);
      triangles.push(poolTri);
    }
  }

  splitByTriangle(triangle: Triangle, isCoplanar: boolean): void {
    const { triangles } = this;

    if (isCoplanar) {
      const arr = [triangle.a, triangle.b, triangle.c];
      for (let i = 0; i < 3; i++) {
        const nexti = (i + 1) % 3;
        const v0 = arr[i];
        const v1 = arr[nexti];

        triangle.getNormal(_triangleNormal).normalize();
        _vec.subVectors(v1, v0).normalize();
        _planeNormal.crossVectors(_triangleNormal, _vec);
        _plane.setFromNormalAndCoplanarPoint(_planeNormal, v0);

        this.splitByPlane(_plane, triangle);
      }
    } else {
      triangle.getPlane(_plane);
      this.splitByPlane(_plane, triangle);
    }
  }

  /** Splits every stored triangle that the plane intersects. */
  splitByPlane(plane: Plane, clippingTriangle: Triangle): void {
    const { triangles, trianglePool } = this;

    _splittingTriangle.copy(clippingTriangle);
    _splittingTriangle.needsUpdate = true;

    for (let i = 0, l = triangles.length; i < l; i++) {
      const tri = triangles[i];

      if (!_splittingTriangle.intersectsTriangle(tri, _edge, true)) continue;

      const { a, b, c } = tri;
      let intersects = 0;
      let vertexSplitEnd = -1;
      let coplanarEdge = false;
      const posSideVerts: number[] = [];
      const negSideVerts: number[] = [];
      const arr = [a, b, c];
      for (let t = 0; t < 3; t++) {
        const tNext = (t + 1) % 3;
        _edge.start.copy(arr[t]);
        _edge.end.copy(arr[tNext]);

        const startDist = plane.distanceToPoint(_edge.start);
        const endDist = plane.distanceToPoint(_edge.end);
        if (Math.abs(startDist) < COPLANAR_EPSILON && Math.abs(endDist) < COPLANAR_EPSILON) {
          coplanarEdge = true;
          break;
        }

        if (startDist > 0) posSideVerts.push(t);
        else negSideVerts.push(t);

        if (Math.abs(startDist) < COPLANAR_EPSILON) continue;

        let didIntersect = !!plane.intersectLine(_edge, _vec);
        if (!didIntersect && Math.abs(endDist) < COPLANAR_EPSILON) {
          _vec.copy(_edge.end);
          didIntersect = true;
        }

        if (didIntersect && !(_vec.distanceTo(_edge.start) < EPSILON)) {
          if (_vec.distanceTo(_edge.end) < EPSILON) vertexSplitEnd = t;

          if (intersects === 0) _foundEdge.start.copy(_vec);
          else _foundEdge.end.copy(_vec);

          intersects++;
        }
      }

      if (!coplanarEdge && intersects === 2 && _foundEdge.distance() > COPLANAR_EPSILON) {
        if (vertexSplitEnd !== -1) {
          vertexSplitEnd = (vertexSplitEnd + 1) % 3;

          let otherVert1 = 0;
          if (otherVert1 === vertexSplitEnd) otherVert1 = (otherVert1 + 1) % 3;

          let otherVert2 = otherVert1 + 1;
          if (otherVert2 === vertexSplitEnd) otherVert2 = (otherVert2 + 1) % 3;

          const nextTri = trianglePool.getInstance();
          nextTri.a.copy(arr[otherVert2]);
          nextTri.b.copy(_foundEdge.end);
          nextTri.c.copy(_foundEdge.start);

          if (!isTriDegenerate(nextTri)) triangles.push(nextTri);

          tri.a.copy(arr[otherVert1]);
          tri.b.copy(_foundEdge.start);
          tri.c.copy(_foundEdge.end);

          if (isTriDegenerate(tri)) {
            triangles.splice(i, 1);
            i--;
            l--;
          }
        } else {
          const singleVert = posSideVerts.length >= 2 ? negSideVerts[0] : posSideVerts[0];

          if (singleVert === 0) {
            const tmp = _foundEdge.start;
            _foundEdge.start = _foundEdge.end;
            _foundEdge.end = tmp;
          }

          const nextVert1 = (singleVert + 1) % 3;
          const nextVert2 = (singleVert + 2) % 3;

          const nextTri1 = trianglePool.getInstance();
          const nextTri2 = trianglePool.getInstance();

          if (arr[nextVert1].distanceToSquared(_foundEdge.start) < arr[nextVert2].distanceToSquared(_foundEdge.end)) {
            nextTri1.a.copy(arr[nextVert1]);
            nextTri1.b.copy(_foundEdge.start);
            nextTri1.c.copy(_foundEdge.end);

            nextTri2.a.copy(arr[nextVert1]);
            nextTri2.b.copy(arr[nextVert2]);
            nextTri2.c.copy(_foundEdge.start);
          } else {
            nextTri1.a.copy(arr[nextVert2]);
            nextTri1.b.copy(_foundEdge.start);
            nextTri1.c.copy(_foundEdge.end);

            nextTri2.a.copy(arr[nextVert1]);
            nextTri2.b.copy(arr[nextVert2]);
            nextTri2.c.copy(_foundEdge.end);
          }

          tri.a.copy(arr[singleVert]);
          tri.b.copy(_foundEdge.end);
          tri.c.copy(_foundEdge.start);

          if (!isTriDegenerate(nextTri1)) triangles.push(nextTri1);
          if (!isTriDegenerate(nextTri2)) triangles.push(nextTri2);

          if (isTriDegenerate(tri)) {
            triangles.splice(i, 1);
            i--;
            l--;
          }
        }
      } else if (intersects === 3) {
        console.warn("TriangleClipper: Coplanar clip not handled");
      }
    }
  }

  reset(): void {
    this.triangles.length = 0;
    this.trianglePool.clear();
  }
}
