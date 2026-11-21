import type { BufferGeometry } from "@random-mesh/rmsl/scene";

export function areSharedArrayBuffersSupported(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

export function getVertexCount(geo: BufferGeometry): number {
  return geo.index ? geo.index.count : geo.attributes.position.count;
}

export function getTriCount(geo: BufferGeometry): number {
  return getVertexCount(geo) / 3;
}

export function ensureIndex(geo: BufferGeometry): void {
  if (geo.index) return;

  const vertexCount = geo.attributes.position.count;
  const index = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) index[i] = i;
  geo.setIndex(index);
}
