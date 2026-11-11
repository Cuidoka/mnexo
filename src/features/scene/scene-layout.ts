import type { NodeSummary } from '../../shared/api/catalog';
import type { SceneProjection } from '../../shared/api/scene';

export type Vector = [number, number, number];
export interface SceneBox {
  node: NodeSummary;
  size: Vector;
  position: Vector; // base central, relativa ao pai
  children: SceneBox[];
}

// Escala visual comprimida; a quantidade exata de bytes permanece no catálogo.
function fileExtent(bytes: string | null): number {
  return bytes === null ? 0.75 : 0.65 + Math.log2(Number(bytes) + 1) / 48;
}

export function layoutScene(projection: SceneProjection): SceneBox {
  const children = new Map<string, NodeSummary[]>();
  for (const node of projection.nodes) {
    const siblings = children.get(node.parentId!) ?? [];
    siblings.push(node);
    children.set(node.parentId!, siblings);
  }
  function arrange(node: NodeSummary): SceneBox {
    const items = (children.get(node.id) ?? []).map(arrange);
    if (node.kind === 'file') {
      const extent = fileExtent(node.sizeBytes);
      return {
        node,
        size: [extent, extent, extent],
        position: [0, 0, 0],
        children: [],
      };
    }
    const columns = Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const rows = Math.max(1, Math.ceil(items.length / columns));
    const cellX = Math.max(1.2, ...items.map((item) => item.size[0])) + 0.65;
    const cellZ = Math.max(1.2, ...items.map((item) => item.size[2])) + 0.65;
    const width = columns * cellX + 0.8;
    const depth = rows * cellZ + 0.8;
    const height = Math.max(1.2, ...items.map((item) => item.size[1])) + 0.8;
    items.forEach((item, index) => {
      item.position = [
        ((index % columns) - (columns - 1) / 2) * cellX,
        0.4,
        (Math.floor(index / columns) - (rows - 1) / 2) * cellZ,
      ];
    });
    return {
      node,
      size: [width, height, depth],
      position: [0, 0, 0],
      children: items,
    };
  }
  return arrange(projection.root.node);
}
