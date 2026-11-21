import { Vector3, Vector4 } from "@random-mesh/rmsl-bvh";
import { BufferAttribute, type BufferGeometry, type Matrix3, type Matrix4 } from "@random-mesh/rmsl/scene";
import { TypeBackedArray } from "../TypeBackedArray";
import type { CSGGeometry } from "../../types";

const _vec3 = new Vector3();
const _vec3_0 = new Vector3();
const _vec3_1 = new Vector3();
const _vec3_2 = new Vector3();

const _vec4 = new Vector4();
const _vec4_0 = new Vector4();
const _vec4_1 = new Vector4();
const _vec4_2 = new Vector4();

function getBarycoordValue(
  a: Vector3 | Vector4,
  b: Vector3 | Vector4,
  c: Vector3 | Vector4,
  barycoord: Vector3,
  target: Vector4,
  normalize = false,
  invert = false,
): Vector4 {
  const aw = (a as Vector4).w ?? 0;
  const bw = (b as Vector4).w ?? 0;
  const cw = (c as Vector4).w ?? 0;

  target.set(
    a.x * barycoord.x + b.x * barycoord.y + c.x * barycoord.z,
    a.y * barycoord.x + b.y * barycoord.y + c.y * barycoord.z,
    a.z * barycoord.x + b.z * barycoord.y + c.z * barycoord.z,
    aw * barycoord.x + bw * barycoord.y + cw * barycoord.z,
  );

  if (normalize) target.normalize();
  if (invert) target.multiplyScalar(-1);

  return target;
}

function pushItemSize(vec: Vector4, itemSize: number, target: TypeBackedArray): void {
  switch (itemSize) {
    case 1:
      target.push(vec.x);
      break;
    case 2:
      target.push(vec.x, vec.y);
      break;
    case 3:
      target.push(vec.x, vec.y, vec.z);
      break;
    case 4:
      target.push(vec.x, vec.y, vec.z, vec.w);
      break;
  }
}

class AttributeData extends TypeBackedArray {
  itemSize = 1;
  normalized = false;

  get count(): number {
    return this.length / this.itemSize;
  }
}

interface InterpolatedFields {
  [key: string]: (Vector3 | Vector4)[];
}

/**
 * Accumulates attribute data for one output geometry and writes it into a
 * target `BufferGeometry` once the operation is complete.
 */
export class GeometryBuilder {
  /** Global sign applied to transformed normals (`-1` for mirrored builders). */
  normalMatrixScale = 1;

  attributeData: Record<string, AttributeData> = {};
  groupIndices: AttributeData[] = [];
  forwardIndexMap = new Map<number | string, number>();
  invertedIndexMap = new Map<number | string, number>();
  interpolatedFields: InterpolatedFields = {};

  initFromGeometry(referenceGeometry: BufferGeometry, relevantAttributes: string[]): void {
    this.clear();

    const { attributeData } = this;
    const refAttributes = referenceGeometry.attributes;
    for (let i = 0, l = relevantAttributes.length; i < l; i++) {
      const key = relevantAttributes[i];
      const refAttr = refAttributes[key];
      const type = (refAttr.array as unknown as { constructor: new (...args: never[]) => never }).constructor;
      if (!attributeData[key]) {
        attributeData[key] = new AttributeData(type as never);
      }

      attributeData[key].setType(type as never);
      attributeData[key].itemSize = refAttr.itemSize;
      attributeData[key].normalized = refAttr.normalized;
    }

    for (const key in attributeData) {
      if (!relevantAttributes.includes(key)) delete attributeData[key];
    }
  }

  initInterpolatedAttributeData(
    geometry: BufferGeometry,
    matrix: Matrix4,
    normalMatrix: Matrix3,
    i0: number,
    i1: number,
    i2: number,
  ): void {
    const { attributeData, interpolatedFields } = this;
    const { attributes } = geometry;

    for (const key in attributeData) {
      const attr = attributes[key];
      if (!attr) throw new Error(`CSG Operations: Attribute ${key} not available on geometry.`);

      let v0: Vector3 | Vector4;
      let v1: Vector3 | Vector4;
      let v2: Vector3 | Vector4;
      if (key === "position") {
        v0 = _vec3_0.fromBufferAttribute(attr, i0).applyMatrix4(matrix);
        v1 = _vec3_1.fromBufferAttribute(attr, i1).applyMatrix4(matrix);
        v2 = _vec3_2.fromBufferAttribute(attr, i2).applyMatrix4(matrix);
      } else if (key === "normal") {
        v0 = _vec3_0
          .fromBufferAttribute(attr, i0)
          .applyNormalMatrix(normalMatrix)
          .multiplyScalar(this.normalMatrixScale);
        v1 = _vec3_1
          .fromBufferAttribute(attr, i1)
          .applyNormalMatrix(normalMatrix)
          .multiplyScalar(this.normalMatrixScale);
        v2 = _vec3_2
          .fromBufferAttribute(attr, i2)
          .applyNormalMatrix(normalMatrix)
          .multiplyScalar(this.normalMatrixScale);
      } else if (key === "tangent") {
        v0 = _vec3_0.fromBufferAttribute(attr, i0).transformDirection(matrix);
        v1 = _vec3_1.fromBufferAttribute(attr, i1).transformDirection(matrix);
        v2 = _vec3_2.fromBufferAttribute(attr, i2).transformDirection(matrix);
      } else {
        v0 = _vec4_0.fromBufferAttribute(attr, i0);
        v1 = _vec4_1.fromBufferAttribute(attr, i1);
        v2 = _vec4_2.fromBufferAttribute(attr, i2);
      }

      if (!interpolatedFields[key]) {
        interpolatedFields[key] = [v0.clone(), v1.clone(), v2.clone()];
      } else {
        const fields = interpolatedFields[key] as { copy(v: Vector3 | Vector4): unknown }[];
        fields[0].copy(v0);
        fields[1].copy(v1);
        fields[2].copy(v2);
      }
    }
  }

  appendInterpolatedAttributeData(
    group: number,
    barycoord: Vector3,
    index: number | string | null = null,
    invert = false,
  ): void {
    const { groupIndices, attributeData, interpolatedFields, forwardIndexMap, invertedIndexMap } = this;
    while (groupIndices.length <= group) {
      groupIndices.push(new AttributeData(Uint32Array));
    }

    const indexMap = invert ? invertedIndexMap : forwardIndexMap;
    const indexData = groupIndices[group];
    if (index !== null && indexMap.has(index)) {
      indexData.push(indexMap.get(index)!);
    } else {
      indexMap.set(index as number | string, attributeData.position.count);
      indexData.push(attributeData.position.count);

      for (const key in interpolatedFields) {
        const arr = attributeData[key];
        const isDirection = key === "normal" || key === "tangent";
        const invertVector = invert && isDirection;
        const itemSize = arr.itemSize;
        const [v0, v1, v2] = interpolatedFields[key];
        getBarycoordValue(v0, v1, v2, barycoord, _vec4, isDirection, invertVector);
        pushItemSize(_vec4, itemSize, arr);
      }
    }
  }

  appendIndexFromGeometry(
    geometry: BufferGeometry,
    matrix: Matrix4,
    normalMatrix: Matrix3,
    group: number,
    index: number,
    invert = false,
  ): void {
    const { groupIndices, attributeData, forwardIndexMap, invertedIndexMap } = this;
    while (groupIndices.length <= group) {
      groupIndices.push(new AttributeData(Uint32Array));
    }

    const indexMap = invert ? invertedIndexMap : forwardIndexMap;
    const indexData = groupIndices[group];
    if (index !== null && indexMap.has(index)) {
      indexData.push(indexMap.get(index)!);
    } else {
      indexMap.set(index, attributeData.position.count);
      indexData.push(attributeData.position.count);

      const { attributes } = geometry;
      for (const key in attributeData) {
        const arr = attributeData[key];
        const attr = attributes[key];
        if (!attr) throw new Error(`CSG Operations: Attribute ${key} not available on geometry.`);

        const itemSize = attr.itemSize;
        if (key === "position") {
          _vec3.fromBufferAttribute(attr, index).applyMatrix4(matrix);
          arr.push(_vec3.x, _vec3.y, _vec3.z);
        } else if (key === "normal") {
          _vec3.fromBufferAttribute(attr, index).applyNormalMatrix(normalMatrix).multiplyScalar(this.normalMatrixScale);
          if (invert) _vec3.multiplyScalar(-1);
          arr.push(_vec3.x, _vec3.y, _vec3.z);
        } else if (key === "tangent") {
          _vec3.fromBufferAttribute(attr, index).transformDirection(matrix);
          if (invert) _vec3.multiplyScalar(-1);
          arr.push(_vec3.x, _vec3.y, _vec3.z);
        } else {
          _vec4.fromBufferAttribute(attr, index);
          pushItemSize(_vec4, itemSize, arr);
        }
      }
    }
  }

  /** Writes the accumulated data into `target` and returns the index count. */
  buildGeometry(target: BufferGeometry): number {
    let needsDisposal = false;
    const { groupIndices, attributeData } = this;
    const { attributes } = target;
    for (const key in attributeData) {
      const arr = attributeData[key];
      const { type, itemSize, normalized, length, count } = arr;
      const buffer = arr.array.buffer;

      let attr = attributes[key];
      if (!attr || attr.count < count || (attr.array as unknown as { constructor: unknown }).constructor !== type) {
        attr = new BufferAttribute(new type(length), itemSize, normalized);
        target.setAttribute(key, attr);
        needsDisposal = true;
      }

      (attr.array as unknown as { set(array: unknown, offset: number): void }).set(new type(buffer, 0, length), 0);
      attr.needsUpdate = true;
    }

    const indexCount = groupIndices.reduce((v, arr) => arr.count + v, 0);
    if (!target.index || target.index.count < indexCount || target.index.array.constructor !== Uint32Array) {
      target.setIndex(new BufferAttribute(new Uint32Array(indexCount), 1));
      needsDisposal = true;
    }

    let offset = 0;
    for (let i = 0, l = groupIndices.length; i < l; i++) {
      const { count } = groupIndices[i];
      const buffer = groupIndices[i].array.buffer;
      if (count !== 0) {
        (target.index!.array as unknown as { set(array: unknown, offset: number): void }).set(
          new Uint32Array(buffer, 0, count),
          offset,
        );
        offset += count;
      }
    }

    const csgTarget = target as CSGGeometry;
    csgTarget.boundsTree = null;
    csgTarget.boundingBox = null;
    csgTarget.boundingSphere = null;

    if (needsDisposal) target.dispose();

    return offset;
  }

  clearIndexMap(): void {
    this.forwardIndexMap.clear();
    this.invertedIndexMap.clear();
  }

  clear(): void {
    const { groupIndices, attributeData } = this;

    this.interpolatedFields = {};

    for (const key in attributeData) attributeData[key].clear();
    groupIndices.forEach((arr) => arr.clear());
    this.clearIndexMap();
  }
}
