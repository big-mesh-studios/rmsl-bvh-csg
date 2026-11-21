# rmsl-bvh-csg

A monorepo that ports the CSG capabilities of
[`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) (and the subset of
[`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) it depends on)
to [RMSL](https://github.com/random-mesh/rmsl), replacing `three` with
`@random-mesh/rmsl/scene`.

It ships two packages:

- `@random-mesh/rmsl-bvh` — a focused TypeScript port of the BVH building,
  raycasting, `bvhcast` and `shapecast` primitives used by CSG.
- `@random-mesh/rmsl-bvh-csg` — the CSG evaluator, brushes, splitters and
  helpers, producing single-material results for RMSL meshes.

## Repository layout

```
packages/
  rmsl-bvh/       # @random-mesh/rmsl-bvh
  rmsl-bvh-csg/   # @random-mesh/rmsl-bvh-csg
```

## Development

```sh
pnpm install
pnpm type-check
pnpm test
pnpm build
```

## Usage

```ts
import { Brush, Evaluator, SUBTRACTION, computeMeshVolume } from "@random-mesh/rmsl-bvh-csg";
import { BoxGeometry, MeshStandardMaterial } from "@random-mesh/rmsl/scene";

const a = new Brush(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
const b = new Brush(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
b.position.set(0.5, 0, 0);
b.updateMatrix();
b.updateMatrixWorld(true);

const evaluator = new Evaluator();
const result = evaluator.evaluate(a, b, SUBTRACTION) as Brush;
console.log(computeMeshVolume(result));
```

## Supported operations

| Constant              | Meaning            |
| --------------------- | ------------------ |
| `ADDITION`            | A ∪ B              |
| `SUBTRACTION`         | A − B              |
| `REVERSE_SUBTRACTION` | B − A              |
| `INTERSECTION`        | A ∩ B              |
| `DIFFERENCE`          | A ⊕ B              |
| `HOLLOW_SUBTRACTION`  | non-manifold A − B |
| `HOLLOW_INTERSECTION` | non-manifold A ∩ B |

Both the legacy splitter and the CDT splitter are available through
`evaluator.useCDTClipping`.

## RMSL-specific adaptations

- No geometry groups or material arrays: the result is a single geometry with
  a single material (brush A's) and a `drawRange` covering the output indices.
- `Evaluator.useGroups` defaults to `false`.
- RMSL's math primitives (`Vector2/3/4`, `Box3`, `Sphere`, `Plane`, `Line3`,
  `Ray`, `Triangle`, `ExtendedTriangle`, `SeparatingAxisBounds`) are provided
  locally on top of RMSL's own math.
- `GridMaterial` keeps the API but renders the plain material, since RMSL does
  not expose `onBeforeCompile`.

## Attribution & licenses

This project is a port of:

- `three-mesh-bvh` — Copyright (c) 2021 Garrett Johnson, MIT License.
- `three-bvh-csg` — Copyright (c) 2021 Garrett Johnson, MIT License.

The constrained Delaunay triangulation is provided by a vendored copy of
`cdt2d` (Copyright (c) 2015 Mikola Lysenko, MIT License). See
`packages/rmsl-bvh-csg/LICENSE-cdt2d.md`.

RMSL itself is licensed under its own terms (see the `rmsl` repository).
This repository's own code is released under the MIT License.
EOF
cat > packages/rmsl-bvh-csg/LICENSE-cdt2d.md <<'EOF'

# cdt2d license

The file `src/libs/cdt2d.js` is a vendored copy of `cdt2d`
(https://github.com/mikolalysenko/cdt2d), Copyright (c) 2015 Mikola Lysenko,
licensed under the MIT License:

```
The MIT License (MIT)

Copyright (c) 2015 Mikola Lysenko

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

EOF
echo done
