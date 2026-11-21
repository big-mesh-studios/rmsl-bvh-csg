import { areSharedArrayBuffersSupported } from "./utils/geometryUtils";

function ceilToFourByteStride(byteLength: number): number {
  byteLength = ~~byteLength;
  return byteLength + 4 - (byteLength % 4);
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

type TypedArrayConstructor = {
  new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): TypedArray;
  new (length: number): TypedArray;
  BYTES_PER_ELEMENT: number;
};

/**
 * An expandable typed array. A group of attributes may switch element types
 * (for example when an output attribute is created from scratch), which is
 * supported as long as the array is still empty.
 */
export class TypeBackedArray {
  expansionFactor = 1.5;
  type: TypedArrayConstructor;
  length = 0;
  array: TypedArray;

  constructor(type: TypedArrayConstructor, initialSize = 500) {
    this.type = type;
    this.array = null as unknown as TypedArray;
    this.setSize(initialSize);
  }

  setType(type: TypedArrayConstructor): void {
    if (type === this.type) return;
    if (this.length !== 0) {
      throw new Error("TypeBackedArray: Cannot change the type while there is used data in the buffer.");
    }

    const buffer = this.array.buffer;
    this.array = new type(buffer);
    this.type = type;
  }

  setSize(size: number): void {
    if (this.array && size === this.array.length) return;

    const type = this.type;
    const bufferType = areSharedArrayBuffersSupported() ? SharedArrayBuffer : ArrayBuffer;
    const newArray = new type(new bufferType(ceilToFourByteStride(size * type.BYTES_PER_ELEMENT)));
    if (this.array) newArray.set(this.array, 0);
    this.array = newArray;
  }

  expand(): void {
    const { array, expansionFactor } = this;
    this.setSize(array.length * expansionFactor);
  }

  push(...values: number[]): void {
    let { array, length } = this;
    if (length + values.length > array.length) {
      this.expand();
      array = this.array;
    }

    for (let i = 0; i < values.length; i++) array[length + i] = values[i];
    this.length += values.length;
  }

  clear(): void {
    this.length = 0;
  }
}
