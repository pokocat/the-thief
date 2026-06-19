import type { ShadowGenerator, AbstractMesh, TransformNode } from "../bjs";

// Tiny global registry so dynamically-built models (towers/enemies/props) can
// register themselves as shadow casters without threading the generator
// through every constructor.
let generator: ShadowGenerator | null = null;

export function setShadowGenerator(g: ShadowGenerator): void {
  generator = g;
}

export function addShadowCasterTree(node: TransformNode): void {
  if (!generator) return;
  for (const m of node.getChildMeshes(false)) {
    generator.addShadowCaster(m as AbstractMesh, false);
  }
}

export function addShadowCaster(mesh: AbstractMesh): void {
  generator?.addShadowCaster(mesh, false);
}
