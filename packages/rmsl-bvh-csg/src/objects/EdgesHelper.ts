import { Line2NodeMaterial, LineSegments2, LineSegmentsGeometry, type Color } from "@random-mesh/rmsl/scene";
import type { Line3 } from "@random-mesh/rmsl-bvh";

/** Renders a set of line segments. */
export class EdgesHelper extends LineSegments2 {
  get color(): Color {
    return this.material.color;
  }

  constructor(edges: Line3[] = []) {
    super(new LineSegmentsGeometry(), new Line2NodeMaterial());
    this.setEdges(edges);
  }

  setEdges(edges: Line3[]): void {
    const points: number[] = [];
    edges.forEach((e) => {
      points.push(e.start.x, e.start.y, e.start.z);
      points.push(e.end.x, e.end.y, e.end.z);
    });

    this.geometry.setPositions(points);
  }
}
