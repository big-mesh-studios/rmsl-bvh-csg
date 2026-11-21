import { Vector4 as RmslVector4 } from "@random-mesh/rmsl/scene";
import type { BufferAttribute } from "@random-mesh/rmsl/scene";

/** A `Vector4` with the three.js helpers the CSG attribute baking uses. */
export class Vector4 extends RmslVector4 {
  clone(): Vector4 {
    return new Vector4(this.x, this.y, this.z, this.w);
  }

  fromBufferAttribute(attribute: BufferAttribute, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    this.w = attribute.getW(index);
    return this;
  }

  addScaledVector(v: Vector4, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    this.w += v.w * s;
    return this;
  }
}
