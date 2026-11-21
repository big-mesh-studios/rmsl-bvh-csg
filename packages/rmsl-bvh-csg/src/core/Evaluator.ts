import { CDTTriangleSplitter } from "./CDTTriangleSplitter";
import { LegacyTriangleSplitter } from "./LegacyTriangleSplitter";
import { OperationDebugData } from "./debug/OperationDebugData";
import { performOperation } from "./operations/operations";
import { Brush } from "./Brush";
import { GeometryBuilder } from "./operations/GeometryBuilder";
import * as GeometryUtils from "./operations/GeometryUtils";
import type { Material } from "@random-mesh/rmsl/scene";

type Splitter = CDTTriangleSplitter | LegacyTriangleSplitter;

/**
 * Performs CSG operations between brushes.
 *
 * RMSL has no material groups or material arrays, so a result is a single
 * geometry with a single material (brush A's). The group-related options of
 * the original three-bvh-csg API are kept for compatibility but have no
 * effect.
 */
export class Evaluator {
  triangleSplitter: Splitter = new LegacyTriangleSplitter();
  geometryBuilders: GeometryBuilder[] = [];

  attributes: string[] = ["position", "uv", "normal"];

  useGroups = false;
  consolidateGroups = true;
  removeUnusedMaterials = true;

  debug = new OperationDebugData();

  get useCDTClipping(): boolean {
    return this.triangleSplitter instanceof CDTTriangleSplitter;
  }

  set useCDTClipping(v: boolean) {
    if (v !== this.useCDTClipping) {
      this.triangleSplitter = v ? new CDTTriangleSplitter() : new LegacyTriangleSplitter();
    }
  }

  evaluate(
    a: Brush,
    b: Brush,
    operations: number | number[],
    targetBrushes: Brush | Brush[] = new Brush(),
  ): Brush | Brush[] {
    let wasArray = true;
    if (!Array.isArray(operations)) operations = [operations];

    if (!Array.isArray(targetBrushes)) {
      targetBrushes = [targetBrushes];
      wasArray = false;
    }

    if (targetBrushes.length !== operations.length) {
      throw new Error("Evaluator: operations and target array passed as different sizes.");
    }

    a.prepareGeometry();
    b.prepareGeometry();

    const { triangleSplitter, geometryBuilders, attributes, useGroups, debug } = this;

    while (geometryBuilders.length < targetBrushes.length) {
      geometryBuilders.push(new GeometryBuilder());
    }

    targetBrushes.forEach((brush, i) => {
      geometryBuilders[i].initFromGeometry(a.geometry, attributes);
      GeometryUtils.trimAttributes(brush.geometry, attributes);
    });

    debug.init();
    performOperation(a, b, operations, triangleSplitter, geometryBuilders, { useGroups });
    debug.complete();

    targetBrushes.forEach((brush, i) => {
      const targetGeometry = brush.geometry;
      const indexCount = geometryBuilders[i].buildGeometry(targetGeometry);

      // The result lives in brush A's frame.
      a.matrixWorld.decompose(brush.position, brush.quaternion, brush.scale);
      brush.updateMatrix();
      brush.matrixWorld.copy(a.matrixWorld);
      brush.drawRange = { start: 0, count: indexCount };

      brush.material = (a.material as Material) ?? brush.material;
    });

    return wasArray ? targetBrushes : targetBrushes[0];
  }

  evaluateHierarchy(root: Brush, target: Brush = new Brush()): Brush {
    root.updateMatrixWorld(true);

    const flatTraverse = (obj: Brush, cb: (child: Brush) => void): void => {
      const children = obj.children;
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i] as unknown as Brush & { isOperationGroup?: boolean };
        if (child.isOperationGroup) flatTraverse(child, cb);
        else cb(child);
      }
    };

    const traverse = (brush: Brush): boolean => {
      const children = brush.children;
      let didChange = false;
      for (let i = 0, l = children.length; i < l; i++) {
        didChange = traverse(children[i] as unknown as Brush) || didChange;
      }

      const isDirty = brush.isDirty();
      if (isDirty) brush.markUpdated();

      if (didChange && !(brush as unknown as { isOperationGroup?: boolean }).isOperationGroup) {
        let result: Brush | null = null;
        flatTraverse(brush, (child) => {
          const operation = (child as unknown as { operation: number }).operation;
          if (!result) result = this.evaluate(brush, child, operation) as Brush;
          else result = this.evaluate(result, child, operation) as Brush;
        });

        const operationBrush = brush as Brush & {
          _cachedGeometry?: unknown;
          _cachedMaterials?: unknown;
        };
        operationBrush._cachedGeometry = result!.geometry;
        operationBrush._cachedMaterials = result!.material;
        return true;
      }

      return didChange || isDirty;
    };

    traverse(root);

    const rootWithCache = root as Brush & { _cachedGeometry?: Brush["geometry"]; _cachedMaterials?: Brush["material"] };
    target.geometry = rootWithCache._cachedGeometry!;
    target.material = rootWithCache._cachedMaterials!;
    return target;
  }

  reset(): void {
    this.triangleSplitter.reset();
  }
}
