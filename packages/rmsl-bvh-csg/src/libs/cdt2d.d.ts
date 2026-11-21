/**
 * Type declarations for the vendored `cdt2d` bundle.
 *
 * `cdt2d` is a constrained Delaunay triangulation library by Mikola Lysenko,
 * distributed under the MIT license. See `LICENSE-cdt2d.md` in this package.
 */
declare const cdt2d: (
  points: [number, number][],
  edges: [number, number][],
  options?: {
    exterior?: boolean;
    interior?: boolean;
    delaunay?: boolean;
    coords?: unknown;
  },
) => [number, number, number][];

export default cdt2d;
