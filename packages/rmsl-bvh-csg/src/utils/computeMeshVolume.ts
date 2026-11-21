import { Triangle, Vector3 } from "@random-mesh/rmsl-bvh";
import type { BufferGeometry, Mesh } from "@random-mesh/rmsl/scene";
import { getTriCount } from "../core/utils/geometryUtils";

// https://stackoverflow.com/questions/1406029/how-to-calculate-the-volume-of-a-3d-mesh-object-the-surface-of-which-is-made-up
const _tri = new Triangle();
const _normal = new Vector3();
const _relPoint = new Vector3();

/**
 * Computes the signed volume of a closed mesh, using the divergence theorem.
 * Accepts either a geometry or a mesh (the mesh's world transform is applied).
 */
export function computeMeshVolume(meshOrGeometry: BufferGeometry | Mesh): number {
  let geometry: BufferGeometry;
  let matrix: import("@random-mesh/rmsl/scene").Matrix4 | null;

  if ((meshOrGeometry as BufferGeometry).isBufferGeometry) {
    geometry = meshOrGeometry as BufferGeometry;
    matrix = null;
  } else {
    const mesh = meshOrGeometry as Mesh;
    geometry = mesh.geometry;
    matrix = Math.abs(mesh.matrixWorld.determinant() - 1.0) < 1e-15 ? null : mesh.matrixWorld;
  }

  const index = geometry.index;
  const pos = geometry.attributes.position;
  const triCount = getTriCount(geometry);

  // get a point relative to the position of the geometry to avoid floating point error
  _relPoint.fromBufferAttribute(pos, 0);
  if (index) _relPoint.set(pos.getX(index.getX(0)), pos.getY(index.getX(0)), pos.getZ(index.getX(0)));

  let volume = 0;
  for (let i = 0; i < triCount; i++) {
    const i3 = 3 * i;
    let i0 = i3 + 0;
    let i1 = i3 + 1;
    let i2 = i3 + 2;
    if (index) {
      i0 = index.getX(i0);
      i1 = index.getX(i1);
      i2 = index.getX(i2);
    }

    _tri.a.fromBufferAttribute(pos, i0).sub(_relPoint);
    _tri.b.fromBufferAttribute(pos, i1).sub(_relPoint);
    _tri.c.fromBufferAttribute(pos, i2).sub(_relPoint);

    if (matrix) {
      _tri.a.applyMatrix4(matrix);
      _tri.b.applyMatrix4(matrix);
      _tri.c.applyMatrix4(matrix);
    }

    _tri.getNormal(_normal);
    volume += (_normal.dot(_tri.a) * _tri.getArea()) / 3;
  }

  return volume;
}
