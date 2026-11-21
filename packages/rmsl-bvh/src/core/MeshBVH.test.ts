import { describe, expect, it } from "vitest";
import { BoxGeometry, Matrix4 } from "@random-mesh/rmsl/scene";
import { MeshBVH, Ray, Triangle, Vector3, ExtendedTriangle } from "../index";

function makeRay(origin: [number, number, number], direction: [number, number, number]): Ray {
  return new Ray(new Vector3(...origin), new Vector3(...direction).normalize());
}

describe("MeshBVH", () => {
  it("builds a tree over a box and reports its bounds", () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const box = bvh.getBoundingBox();
    expect(box.min.x).toBeCloseTo(-1);
    expect(box.max.x).toBeCloseTo(1);
    expect(box.min.y).toBeCloseTo(-1);
    expect(box.max.y).toBeCloseTo(1);
    expect(box.min.z).toBeCloseTo(-1);
    expect(box.max.z).toBeCloseTo(1);
  });

  it("raycasts against a box", () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const ray = makeRay([0, 0, 5], [0, 0, -1]);
    const hits = bvh.raycast(ray);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].distance).toBeCloseTo(4);
    expect(hits[0].point.z).toBeCloseTo(1);

    const first = bvh.raycastFirst(ray);
    expect(first).not.toBeNull();
    expect(first!.distance).toBeCloseTo(4);
  });

  it("returns no hits for a ray that misses", () => {
    const bvh = new MeshBVH(new BoxGeometry(2, 2, 2));
    const hits = bvh.raycast(makeRay([5, 5, 5], [0, 0, -1]));
    expect(hits).toEqual([]);
  });

  it("refits after moving vertices", () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const position = geometry.attributes.position;
    const array = position.array as Float32Array;
    for (let i = 0; i < position.count; i++) array[i * 3] *= 2;
    position.needsUpdate = true;
    bvh.refit();
    const box = bvh.getBoundingBox();
    expect(box.min.x).toBeCloseTo(-2);
    expect(box.max.x).toBeCloseTo(2);
  });

  it("detects intersections between two overlapping box BVHs", () => {
    const a = new MeshBVH(new BoxGeometry(2, 2, 2));
    const bGeometry = new BoxGeometry(2, 2, 2);
    const b = new MeshBVH(bGeometry);
    // translate b by 1 along x
    const position = bGeometry.attributes.position;
    const array = position.array as Float32Array;
    for (let i = 0; i < position.count; i++) array[i * 3] += 1;
    position.needsUpdate = true;
    b.refit();

    const identity = new Matrix4();

    let intersections = 0;
    a.bvhcast(b, identity, {
      intersectsTriangles() {
        intersections++;
        return false;
      },
    });
    expect(intersections).toBeGreaterThan(0);
  });

  it("finds the closest point on a box", () => {
    const bvh = new MeshBVH(new BoxGeometry(2, 2, 2));
    const result = bvh.closestPointToPoint(new Vector3(0, 0, 5));
    expect(result.distance).toBeCloseTo(4);
    expect(result.point.z).toBeCloseTo(1);
  });
});

describe("ExtendedTriangle", () => {
  it("detects overlapping triangles", () => {
    const a = new ExtendedTriangle(new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 1, 0));
    const b = new ExtendedTriangle(new Vector3(-0.5, -0.5, -1), new Vector3(0.5, -0.5, 1), new Vector3(0, 0.5, 0));
    expect(a.intersectsTriangle(b)).toBe(true);
  });

  it("rejects separated triangles", () => {
    const a = new ExtendedTriangle(new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 1, 0));
    const b = new ExtendedTriangle(new Vector3(-1, -1, 2), new Vector3(1, -1, 2), new Vector3(0, 1, 2));
    expect(a.intersectsTriangle(b)).toBe(false);
  });
});

describe("Triangle.getPlane", () => {
  it("computes a valid plane for a triangle", () => {
    const tri = new Triangle(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0));
    const plane = tri.getPlane();
    expect(plane.normal.length()).toBeCloseTo(1);
    expect(Math.abs(plane.normal.x)).toBeCloseTo(1);
    expect(plane.distanceToPoint(new Vector3(0, 0.25, 0.25))).toBeCloseTo(0);
  });

  it("reports front and back facing", () => {
    const tri = new Triangle(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0));
    const normal = tri.getNormal();
    expect(tri.isFrontFacing(normal)).toBe(false);
    expect(tri.isFrontFacing(normal.clone().multiplyScalar(-1))).toBe(true);
  });
});
