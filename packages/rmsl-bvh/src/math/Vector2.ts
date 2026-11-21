import { Vector2 as RmslVector2 } from "@random-mesh/rmsl/scene";
import type { BufferAttribute } from "@random-mesh/rmsl/scene";

/** A `Vector2` with the three.js helpers the BVH and CSG code uses. */
export class Vector2 extends RmslVector2 {
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  fromBufferAttribute(attribute: BufferAttribute, index: number): this {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    return this;
  }

  addScaledVector(v: Vector2, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }
}
