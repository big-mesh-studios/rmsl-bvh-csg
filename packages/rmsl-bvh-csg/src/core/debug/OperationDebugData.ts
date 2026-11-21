import { Triangle, type Line3 } from "@random-mesh/rmsl-bvh";
import { setDebugContext } from "../operations/operationsUtils";

class TriangleIntersectData {
  triangle: Triangle;
  intersects: Record<string, Triangle> = {};

  constructor(tri: Triangle) {
    this.triangle = new Triangle().copy(tri);
  }

  addTriangle(index: number, tri: Triangle): void {
    this.intersects[String(index)] = new Triangle().copy(tri);
  }

  getIntersectArray(): Triangle[] {
    const array: Triangle[] = [];
    const { intersects } = this;
    for (const key in intersects) array.push(intersects[key]);
    return array;
  }
}

class TriangleIntersectionSets {
  data: Record<string, TriangleIntersectData> = {};

  addTriangleIntersection(ia: number, triA: Triangle, ib: number, triB: Triangle): void {
    const { data } = this;
    if (!data[String(ia)]) data[String(ia)] = new TriangleIntersectData(triA);
    data[String(ia)].addTriangle(ib, triB);
  }

  getTrianglesAsArray(id: number | null = null): Triangle[] {
    const { data } = this;
    const arr: Triangle[] = [];

    if (id !== null) {
      if (id in data) arr.push(data[String(id)].triangle);
    } else {
      for (const key in data) arr.push(data[key].triangle);
    }

    return arr;
  }

  getTriangleIndices(): number[] {
    return Object.keys(this.data).map((i) => parseInt(i));
  }

  getIntersectionIndices(id: number): number[] {
    const { data } = this;
    if (!data[String(id)]) return [];
    return Object.keys(data[String(id)].intersects).map((i) => parseInt(i));
  }

  getIntersectionsAsArray(id: number | null = null, id2: number | null = null): Triangle[] {
    const { data } = this;
    const triSet = new Set<string>();
    const arr: Triangle[] = [];

    const addTriangles = (key: number) => {
      if (!data[String(key)]) return;

      if (id2 !== null) {
        if (data[String(key)].intersects[String(id2)]) arr.push(data[String(key)].intersects[String(id2)]);
      } else {
        const intersects = data[String(key)].intersects;
        for (const key2 in intersects) {
          if (!triSet.has(key2)) {
            triSet.add(key2);
            arr.push(intersects[key2]);
          }
        }
      }
    };

    if (id !== null) {
      addTriangles(id);
    } else {
      for (const key in data) addTriangles(parseInt(key));
    }

    return arr;
  }

  reset(): void {
    this.data = {};
  }
}

/** Optional bookkeeping populated while `Evaluator.debug.enabled` is true. */
export class OperationDebugData {
  enabled = false;
  triangleIntersectsA = new TriangleIntersectionSets();
  triangleIntersectsB = new TriangleIntersectionSets();
  intersectionEdges: Line3[] = [];

  addIntersectingTriangles(ia: number, triA: Triangle, ib: number, triB: Triangle): void {
    const { triangleIntersectsA, triangleIntersectsB } = this;
    triangleIntersectsA.addTriangleIntersection(ia, triA, ib, triB);
    triangleIntersectsB.addTriangleIntersection(ib, triB, ia, triA);
  }

  addEdge(edge: Line3): void {
    this.intersectionEdges.push(edge.clone());
  }

  reset(): void {
    this.triangleIntersectsA.reset();
    this.triangleIntersectsB.reset();
    this.intersectionEdges = [];
  }

  init(): void {
    if (this.enabled) {
      this.reset();
      setDebugContext(this);
    }
  }

  complete(): void {
    if (this.enabled) setDebugContext(null);
  }
}
