import { InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, type Color } from "@random-mesh/rmsl/scene";
import type { Vector3 } from "@random-mesh/rmsl-bvh";

const _matrix = new Matrix4();

/** Renders a set of points as small instanced spheres. */
export class PointsHelper extends InstancedMesh {
  get color(): Color {
    return (this.material as MeshBasicMaterial).color;
  }

  constructor(count = 1000, points: Vector3[] = []) {
    super(new SphereGeometry(0.025), new MeshBasicMaterial(), count);
    this.setPoints(points);
  }

  setPoints(points: Vector3[]): void {
    for (let i = 0, l = points.length; i < l; i++) {
      const point = points[i];
      _matrix.makeTranslation(point.x, point.y, point.z);
      this.setMatrixAt(i, _matrix);
    }

    this.count = points.length;
  }
}
