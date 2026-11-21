import type { BufferGeometry, Material } from "@random-mesh/rmsl/scene";

export interface MaterialGroup {
  start: number;
  count: number;
  materialIndex: number;
  index?: number;
}

export function trimAttributes(targetGeometry: BufferGeometry, relevantAttributes: string[]): BufferGeometry {
  for (const key in targetGeometry.attributes) {
    if (!relevantAttributes.includes(key)) {
      targetGeometry.deleteAttribute(key);
      targetGeometry.dispose();
    }
  }
  return targetGeometry;
}

/** Rewrites group material indices to a common list of materials. */
export function useCommonMaterials(groups: MaterialGroup[], materials: Material[]): MaterialGroup[] {
  return groups.map((group) => {
    const mat = materials[group.materialIndex];
    return { ...group, materialIndex: materials.indexOf(mat) };
  });
}

/** Returns a new material list and modifies groups to reference it. */
export function removeUnusedMaterials(groups: MaterialGroup[], materials: Material[]): Material[] {
  const newMaterials: Material[] = [];
  const indexMap = new Map<number, number>();
  for (let g = 0, lg = groups.length; g < lg; g++) {
    const group = groups[g];
    if (!indexMap.has(group.materialIndex)) {
      indexMap.set(group.materialIndex, newMaterials.length);
      newMaterials.push(materials[group.materialIndex]);
    }
    group.materialIndex = indexMap.get(group.materialIndex)!;
  }
  return newMaterials;
}

/** Merges adjacent groups that share a material index in place. */
export function joinGroups(groups: MaterialGroup[]): void {
  for (let i = 0; i < groups.length - 1; i++) {
    const group = groups[i];
    const nextGroup = groups[i + 1];
    if (group.materialIndex === nextGroup.materialIndex) {
      const start = group.start;
      const end = nextGroup.start + nextGroup.count;
      nextGroup.start = start;
      nextGroup.count = end - start;
      groups.splice(i, 1);
      i--;
    }
  }
}

/** Expands a single material into a list indexed by the given groups. */
export function getMaterialList(groups: MaterialGroup[], materials: Material | Material[]): Material[] {
  let result = materials as Material[];
  if (!Array.isArray(materials)) {
    result = [];
    groups.forEach((g) => {
      result[g.materialIndex] = materials;
    });
  }
  return result;
}
