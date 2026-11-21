import { Vector2, Vector3, Vector4, type Ray } from "@random-mesh/rmsl-bvh";
import type { BufferGeometry } from "@random-mesh/rmsl/scene";
import { hashNumber, hashVertex2, hashVertex3, hashVertex4 } from "./utils/hashUtils";
import { getTriCount } from "./utils/geometryUtils";
import { computeDisjointEdges } from "./utils/computeDisjointEdges";

const _vec2 = new Vector2();
const _vec3 = new Vector3();
const _vec4 = new Vector4();
const _hashes = ["", "", ""];

type FragmentInfo = { start: number; end: number; index: number };
type FragmentMap = Map<Ray, { forward: FragmentInfo[]; reverse: FragmentInfo[]; ray: Ray }>;

/**
 * Builds connectivity information between triangles by hashing shared edges.
 * Used to find watertight boundaries and to walk triangle fans.
 */
export class HalfEdgeMap {
  data: Int32Array | null = null;
  disjointConnections: Map<number, number[]> | null = null;
  unmatchedDisjointEdges: FragmentMap | null = null;
  unmatchedEdges = -1;
  matchedEdges = -1;

  useAllAttributes = false;
  matchDisjointEdges = false;
  degenerateEpsilon = 1e-8;

  getSiblingTriangleIndex(triIndex: number, edgeIndex: number): number {
    const otherIndex = this.data![triIndex * 3 + edgeIndex];
    return otherIndex === -1 ? -1 : ~~(otherIndex / 3);
  }

  getSiblingEdgeIndex(triIndex: number, edgeIndex: number): number {
    const otherIndex = this.data![triIndex * 3 + edgeIndex];
    return otherIndex === -1 ? -1 : otherIndex % 3;
  }

  getDisjointSiblingTriangleIndices(triIndex: number, edgeIndex: number): number[] {
    const index = triIndex * 3 + edgeIndex;
    const arr = this.disjointConnections!.get(index);
    return arr ? arr.map((i) => ~~(i / 3)) : [];
  }

  getDisjointSiblingEdgeIndices(triIndex: number, edgeIndex: number): number[] {
    const index = triIndex * 3 + edgeIndex;
    const arr = this.disjointConnections!.get(index);
    return arr ? arr.map((i) => i % 3) : [];
  }

  isFullyConnected(): boolean {
    return this.unmatchedEdges === 0;
  }

  updateFrom(geometry: BufferGeometry): void {
    const { useAllAttributes, matchDisjointEdges, degenerateEpsilon } = this;
    const hashFunction = useAllAttributes ? hashAllAttributes : hashPositionAttribute;

    const map = new Map<string, number>();
    const { attributes } = geometry;
    const attrKeys = useAllAttributes ? Object.keys(attributes) : null;
    const indexAttr = geometry.index;
    const posAttr = attributes.position;

    const triCount = getTriCount(geometry);
    const maxTriCount = triCount;

    let data = this.data;
    if (!data || data.length < 3 * maxTriCount) data = new Int32Array(3 * maxTriCount);
    data.fill(-1);

    let matchedEdges = 0;
    const unmatchedSet = new Set<number>();
    for (let i = 0, l = triCount * 3; i < l; i += 3) {
      const i3 = i;
      for (let e = 0; e < 3; e++) {
        let i0 = i3 + e;
        if (indexAttr) i0 = indexAttr.getX(i0);
        _hashes[e] = hashFunction(i0);
      }

      for (let e = 0; e < 3; e++) {
        const nextE = (e + 1) % 3;
        const vh0 = _hashes[e];
        const vh1 = _hashes[nextE];

        const reverseHash = `${vh1}_${vh0}`;
        if (map.has(reverseHash)) {
          const index = i3 + e;
          const otherIndex = map.get(reverseHash)!;
          data[index] = otherIndex;
          data[otherIndex] = index;
          map.delete(reverseHash);
          matchedEdges += 2;
          unmatchedSet.delete(otherIndex);
        } else {
          const hash = `${vh0}_${vh1}`;
          const index = i3 + e;
          map.set(hash, index);
          unmatchedSet.add(index);
        }
      }
    }

    if (matchDisjointEdges) {
      const { fragmentMap, disjointConnectivityMap } = computeDisjointEdges(geometry, unmatchedSet, degenerateEpsilon);

      unmatchedSet.clear();
      fragmentMap.forEach(({ forward, reverse }) => {
        forward.forEach(({ index }) => unmatchedSet.add(index));
        reverse.forEach(({ index }) => unmatchedSet.add(index));
      });

      this.unmatchedDisjointEdges = fragmentMap;
      this.disjointConnections = disjointConnectivityMap;
      matchedEdges = triCount * 3 - unmatchedSet.size;
    }

    this.matchedEdges = matchedEdges;
    this.unmatchedEdges = unmatchedSet.size;
    this.data = data;

    function hashPositionAttribute(i: number): string {
      _vec3.fromBufferAttribute(posAttr, i);
      return hashVertex3(_vec3);
    }

    function hashAllAttributes(i: number): string {
      let result = "";
      for (let k = 0, l = attrKeys!.length; k < l; k++) {
        const attr = attributes[attrKeys![k]];
        let str: string;
        switch (attr.itemSize) {
          case 1:
            str = String(hashNumber(attr.getX(i)));
            break;
          case 2:
            str = hashVertex2(_vec2.fromBufferAttribute(attr, i));
            break;
          case 3:
            str = hashVertex3(_vec3.fromBufferAttribute(attr, i));
            break;
          case 4:
            str = hashVertex4(_vec4.fromBufferAttribute(attr, i));
            break;
          default:
            str = "";
        }

        if (result !== "") result += "|";
        result += str;
      }
      return result;
    }
  }
}
