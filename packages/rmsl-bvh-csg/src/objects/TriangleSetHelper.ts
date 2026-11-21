import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line2NodeMaterial,
  LineSegments2,
  LineSegmentsGeometry,
  Mesh,
  MeshBasicMaterial,
  type Side,
} from "@random-mesh/rmsl/scene";
import type { Triangle } from "@random-mesh/rmsl-bvh";

/** A group that renders a set of triangles filled and outlined. */
export class TriangleSetHelper extends Group {
  private _mesh: Mesh;
  private _lines: LineSegments2;

  get color(): Color {
    return (this._mesh.material as MeshBasicMaterial).color;
  }

  get side(): Side {
    return (this._mesh.material as MeshBasicMaterial).side;
  }

  set side(v: Side) {
    (this._mesh.material as MeshBasicMaterial).side = v;
  }

  constructor(triangles: Triangle[] = []) {
    super();

    const material = new MeshBasicMaterial({ transparent: true, opacity: 0.25 });
    material.depthWrite = false;
    const lineMaterial = new Line2NodeMaterial();
    material.color = lineMaterial.color;

    this._mesh = new Mesh(new BufferGeometry(), material);
    this._lines = new LineSegments2(new LineSegmentsGeometry(), lineMaterial);

    this.add(this._lines, this._mesh);
    this.setTriangles(triangles);
  }

  setTriangles(triangles: Triangle[]): void {
    const triPositions = new Float32Array(3 * 3 * triangles.length);
    const linePositions = new Float32Array(6 * 3 * triangles.length);
    for (let i = 0, l = triangles.length; i < l; i++) {
      const i9 = 9 * i;
      const i18 = 18 * i;
      const tri = triangles[i];

      tri.a.toArray(triPositions, i9 + 0);
      tri.b.toArray(triPositions, i9 + 3);
      tri.c.toArray(triPositions, i9 + 6);

      tri.a.toArray(linePositions, i18 + 0);
      tri.b.toArray(linePositions, i18 + 3);

      tri.b.toArray(linePositions, i18 + 6);
      tri.c.toArray(linePositions, i18 + 9);

      tri.c.toArray(linePositions, i18 + 12);
      tri.a.toArray(linePositions, i18 + 15);
    }

    this._mesh.geometry.dispose();
    this._mesh.geometry.setAttribute("position", new BufferAttribute(triPositions, 3));

    this._lines.geometry.dispose();
    this._lines.geometry.setPositions(linePositions);
  }
}
