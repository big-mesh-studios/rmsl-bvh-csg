import { describe, expect, it } from "vitest";
import { BoxGeometry, MeshStandardMaterial, type BufferGeometry } from "@random-mesh/rmsl/scene";
import {
  ADDITION,
  Brush,
  DIFFERENCE,
  Evaluator,
  HOLLOW_INTERSECTION,
  HOLLOW_SUBTRACTION,
  INTERSECTION,
  Operation,
  SUBTRACTION,
  computeMeshVolume,
  isWaterTight,
} from "../index";

function makeBrush(size = 2, x = 0, y = 0, z = 0): Brush {
  const brush = new Brush(new BoxGeometry(size, size, size), new MeshStandardMaterial());
  brush.position.set(x, y, z);
  brush.updateMatrix();
  brush.updateMatrixWorld(true);
  return brush;
}

function volumeOf(geometry: BufferGeometry): number {
  return Math.abs(computeMeshVolume(geometry));
}

const overlapping = (): [Brush, Brush] => [makeBrush(2), makeBrush(2, 0.5, 0.5, 0.5)];

// Two 2x2x2 boxes offset by 0.5 have a 1.5^3 overlap.
const OVERLAP = 1.5 ** 3;
const BOX = 8;

describe("Evaluator", () => {
  it("subtracts a smaller box", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(1);
    const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(volumeOf(result.geometry)).toBeCloseTo(BOX - 1, 3);
  });

  it("reuses brush A's material and sets the draw range", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(1);
    const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
    expect(result.material).toBe(a.material);
    expect(result.drawRange.count).toBe(result.geometry.index!.count);
  });

  for (const cdt of [false, true]) {
    describe(cdt ? "with CDT clipping" : "with legacy clipping", () => {
      function makeEvaluator(): Evaluator {
        const evaluator = new Evaluator();
        evaluator.useCDTClipping = cdt;
        return evaluator;
      }

      it("adds overlapping boxes", () => {
        const [a, b] = overlapping();
        const result = makeEvaluator().evaluate(a, b, ADDITION) as Brush;
        expect(volumeOf(result.geometry)).toBeCloseTo(BOX * 2 - OVERLAP, 2);
        expect(isWaterTight(result.geometry)).toBe(true);
      });

      it("intersects overlapping boxes", () => {
        const [a, b] = overlapping();
        const result = makeEvaluator().evaluate(a, b, INTERSECTION) as Brush;
        expect(volumeOf(result.geometry)).toBeCloseTo(OVERLAP, 2);
        expect(isWaterTight(result.geometry)).toBe(true);
      });

      it("subtracts overlapping boxes", () => {
        const [a, b] = overlapping();
        const result = makeEvaluator().evaluate(a, b, SUBTRACTION) as Brush;
        expect(volumeOf(result.geometry)).toBeCloseTo(BOX - OVERLAP, 2);
        expect(isWaterTight(result.geometry)).toBe(true);
      });

      it("computes the symmetric difference", () => {
        const [a, b] = overlapping();
        const result = makeEvaluator().evaluate(a, b, DIFFERENCE) as Brush;
        expect(volumeOf(result.geometry)).toBeCloseTo(BOX * 2 - OVERLAP * 2, 2);
      });
    });
  }

  it("respects brush transforms", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(1, 0.5, 0, 0);
    const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
    // the removed half-cube is 1 x 1 x 1 = 1
    expect(volumeOf(result.geometry)).toBeCloseTo(BOX - 1, 2);
  });

  it("respects rotations that map a box onto itself", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(2, 0.5, 0.5, 0.5);
    b.rotation.set(0, Math.PI / 2, 0);
    b.updateMatrix();
    b.updateMatrixWorld(true);

    const result = evaluator.evaluate(a, b, INTERSECTION) as Brush;
    expect(volumeOf(result.geometry)).toBeCloseTo(OVERLAP, 2);
    expect(isWaterTight(result.geometry)).toBe(true);
  });

  it("respects parent scaling when measuring world volume", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    a.scale.set(2, 2, 2);
    a.updateMatrix();
    a.updateMatrixWorld(true);

    const b = makeBrush(2);
    const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
    // A is a 4x4x4 world box minus the 2x2x2 box B.
    expect(Math.abs(computeMeshVolume(result))).toBeCloseTo(4 ** 3 - 2 ** 3, 2);
  });

  it("produces watertight results", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(1);
    const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
    expect(isWaterTight(result.geometry)).toBe(true);
  });

  it("supports hollow operations that leave the surface open", () => {
    for (const operation of [HOLLOW_SUBTRACTION, HOLLOW_INTERSECTION]) {
      const [a, b] = overlapping();
      const result = new Evaluator().evaluate(a, b, operation) as Brush;
      expect(result.geometry.index!.count).toBeGreaterThan(0);
      expect(isWaterTight(result.geometry)).toBe(false);
    }
  });

  it("evaluates multiple operations into multiple targets", () => {
    const evaluator = new Evaluator();
    const a = makeBrush(2);
    const b = makeBrush(1);
    const results = evaluator.evaluate(
      a,
      b,
      [SUBTRACTION, INTERSECTION],
      [new Brush(new BoxGeometry()), new Brush(new BoxGeometry())],
    ) as Brush[];
    expect(results).toHaveLength(2);
    expect(volumeOf(results[0].geometry)).toBeCloseTo(BOX - 1, 2);
    expect(volumeOf(results[1].geometry)).toBeCloseTo(1, 2);
  });

  it("evaluates an operation hierarchy", () => {
    const evaluator = new Evaluator();

    const root = new Brush(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
    const hole = new Operation(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    hole.operation = SUBTRACTION;
    root.add(hole);
    root.updateMatrix();
    root.updateMatrixWorld(true);

    const result = evaluator.evaluateHierarchy(root, new Brush(new BoxGeometry(), new MeshStandardMaterial()));
    expect(volumeOf(result.geometry)).toBeCloseTo(BOX - 1, 2);
  });
});
