import { BufferAttribute, Color } from "@random-mesh/rmsl/scene";
import type { BufferGeometry } from "@random-mesh/rmsl/scene";
import type { Triangle } from "@random-mesh/rmsl-bvh";

/** Formats triangles as three.js-style constructor source for debugging. */
export function getTriangleDefinitions(...triangles: Triangle[]): string[] {
  function getVectorDefinition(v: { x: number; y: number; z: number }): string {
    return `new Vector3( ${v.x}, ${v.y}, ${v.z} )`;
  }

  return triangles.map((t) => {
    return `
new Triangle(
  ${getVectorDefinition(t.a)},
  ${getVectorDefinition(t.b)},
  ${getVectorDefinition(t.c)},
)`.trim();
  });
}

export function logTriangleDefinitions(...triangles: Triangle[]): void {
  console.log(getTriangleDefinitions(...triangles).join(",\n"));
}

/** Assigns a random color to every triangle of the given geometry. */
export function generateRandomTriangleColors(geometry: BufferGeometry): void {
  const position = geometry.attributes.position;
  const array = new Float32Array(position.count * 3);
  const color = new Color();

  for (let i = 0, l = array.length; i < l; i += 9) {
    // HSL-ish random color with a bright, saturated range.
    const h = Math.random();
    const s = 0.5 + Math.random() * 0.5;
    const l2 = 0.5 + Math.random() * 0.25;
    hslToRgb(h, s, l2, color);

    array[i + 0] = color.r;
    array[i + 1] = color.g;
    array[i + 2] = color.b;

    array[i + 3] = color.r;
    array[i + 4] = color.g;
    array[i + 5] = color.b;

    array[i + 6] = color.r;
    array[i + 7] = color.g;
    array[i + 8] = color.b;
  }

  geometry.setAttribute("color", new BufferAttribute(array, 3));
}

function hslToRgb(h: number, s: number, l: number, target: Color): void {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    target.setRGB(l, l, l);
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    target.setRGB(hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3));
  }
}
