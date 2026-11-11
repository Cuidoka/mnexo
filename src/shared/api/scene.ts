import { invoke, isTauri } from '@tauri-apps/api/core';
import { DesktopRequiredError } from './app-status';
import {
  parseNodeDetail,
  parseNodeSummary,
  type NodeDetail,
  type NodeSummary,
} from './catalog';

export interface SceneProjection {
  root: NodeDetail;
  nodes: NodeSummary[];
  nodeLimit: 100;
  depthLimit: 3;
  truncated: boolean;
}

function invalid(): never {
  throw new Error('Projeção 3D incompatível.');
}

// RF-003 / T-051: só uma árvore limitada, com pais anteriores aos filhos.
export function parseSceneProjection(value: unknown): SceneProjection {
  if (typeof value !== 'object' || value === null) return invalid();
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.nodes) ||
    data.nodes.length > 99 ||
    data.nodeLimit !== 100 ||
    data.depthLimit !== 3 ||
    typeof data.truncated !== 'boolean'
  )
    return invalid();
  const root = parseNodeDetail(data.root);
  if (root.node.kind !== 'folder' || root.node.parentId !== null)
    return invalid();
  const nodes = data.nodes.map(parseNodeSummary);
  const known = new Map<string, { kind: NodeSummary['kind']; depth: number }>([
    [root.node.id, { kind: root.node.kind, depth: 0 }],
  ]);
  for (const node of nodes) {
    const parent =
      node.parentId === null ? undefined : known.get(node.parentId);
    if (
      known.has(node.id) ||
      !parent ||
      parent.kind !== 'folder' ||
      parent.depth >= 3
    )
      return invalid();
    known.set(node.id, { kind: node.kind, depth: parent.depth + 1 });
  }
  return {
    root,
    nodes,
    nodeLimit: 100,
    depthLimit: 3,
    truncated: data.truncated,
  };
}

export async function getSceneProjection(
  sourceId: string,
  scanId: string,
): Promise<SceneProjection> {
  if (!isTauri()) throw new DesktopRequiredError();
  const projection = parseSceneProjection(
    await invoke<unknown>('get_scene_projection', { sourceId, scanId }),
  );
  if (
    projection.root.sourceId !== sourceId ||
    projection.root.scanId !== scanId
  )
    return invalid();
  return projection;
}
