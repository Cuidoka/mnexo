import { invoke, isTauri } from '@tauri-apps/api/core';
import { DesktopRequiredError } from './app-status';
import {
  parseNodeDetail,
  parseNodeSummary,
  type NodeDetail,
  type NodeSummary,
  type Breadcrumb,
} from './catalog';

export interface SceneProjection {
  root: NodeDetail;
  breadcrumbs: Breadcrumb[];
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
  if (
    root.node.kind !== 'folder' ||
    !Array.isArray(data.breadcrumbs) ||
    data.breadcrumbs.length < 1 ||
    data.breadcrumbs.length > 32
  )
    return invalid();
  const breadcrumbs = data.breadcrumbs.map((item: unknown): Breadcrumb => {
    if (typeof item !== 'object' || item === null) return invalid();
    const crumb = item as Record<string, unknown>;
    if (
      typeof crumb.id !== 'string' ||
      !crumb.id ||
      typeof crumb.title !== 'string' ||
      !crumb.title
    )
      return invalid();
    return { id: crumb.id, title: crumb.title };
  });
  if (
    new Set(breadcrumbs.map((item) => item.id)).size !== breadcrumbs.length ||
    breadcrumbs.at(-1)?.id !== root.node.id ||
    breadcrumbs.at(-1)?.title !== root.node.title ||
    (breadcrumbs.at(-2)?.id ?? null) !== root.node.parentId ||
    (root.parent !== null && breadcrumbs.at(-2)?.title !== root.parent.title)
  )
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
      breadcrumbs.some((item) => item.id === node.id) ||
      !parent ||
      parent.kind !== 'folder' ||
      parent.depth >= 3
    )
      return invalid();
    known.set(node.id, { kind: node.kind, depth: parent.depth + 1 });
  }
  return {
    root,
    breadcrumbs,
    nodes,
    nodeLimit: 100,
    depthLimit: 3,
    truncated: data.truncated,
  };
}

export async function getSceneProjection(
  sourceId: string,
  scanId: string,
  folderId: string | null = null,
): Promise<SceneProjection> {
  if (!isTauri()) throw new DesktopRequiredError();
  const projection = parseSceneProjection(
    await invoke<unknown>('get_scene_projection', {
      sourceId,
      scanId,
      folderId,
    }),
  );
  if (
    projection.root.sourceId !== sourceId ||
    projection.root.scanId !== scanId ||
    (folderId === null
      ? projection.root.node.parentId !== null
      : projection.root.node.id !== folderId)
  )
    return invalid();
  return projection;
}
