import { invoke, isTauri } from '@tauri-apps/api/core';
import { DesktopRequiredError } from './app-status';

export interface NodeSummary {
  id: string;
  parentId: string | null;
  kind: 'file' | 'folder';
  title: string;
  sizeBytes: string | null;
  sizePartial: boolean;
  modifiedAtMs: string | null;
}
export interface Breadcrumb {
  id: string;
  title: string;
}
export interface NodeDetail {
  sourceId: string;
  scanId: string;
  indexedAt: string;
  sourceName: string;
  sourceRootPath: string;
  node: NodeSummary;
  path: string;
  createdAtMs: string | null;
  parent: Breadcrumb | null;
}
export interface NodePage {
  folder: NodeDetail;
  breadcrumbs: Breadcrumb[];
  items: NodeSummary[];
  nextCursor: string | null;
}
export const CATALOG_PAGE_SIZE = 50;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function optionalText(value: unknown): value is string | null {
  return value === null || text(value);
}
function timestamp(value: unknown): value is string | null {
  return (
    value === null ||
    (text(value) && value.length <= 40 && /^-?\d+$/.test(value))
  );
}
function bytes(value: unknown): value is string | null {
  return (
    value === null ||
    (text(value) &&
      /^(0|[1-9]\d{0,18})$/.test(value) &&
      BigInt(value) <= 9223372036854775807n)
  );
}
function invalid(): never {
  throw new Error('Resposta de catálogo incompatível.');
}
export function parseNodeSummary(value: unknown): NodeSummary {
  if (
    !record(value) ||
    !text(value.id) ||
    !optionalText(value.parentId) ||
    !['file', 'folder'].includes(value.kind as string) ||
    !text(value.title) ||
    !bytes(value.sizeBytes) ||
    typeof value.sizePartial !== 'boolean' ||
    !timestamp(value.modifiedAtMs)
  )
    return invalid();
  return {
    id: value.id,
    parentId: value.parentId,
    kind: value.kind as NodeSummary['kind'],
    title: value.title,
    sizeBytes: value.sizeBytes,
    sizePartial: value.sizePartial,
    modifiedAtMs: value.modifiedAtMs,
  };
}
function parseBreadcrumb(value: unknown): Breadcrumb {
  if (!record(value) || !text(value.id) || !text(value.title)) return invalid();
  return { id: value.id, title: value.title };
}
export function parseNodeDetail(value: unknown): NodeDetail {
  if (
    !record(value) ||
    !text(value.sourceId) ||
    !text(value.scanId) ||
    !text(value.indexedAt) ||
    !Number.isFinite(Date.parse(value.indexedAt)) ||
    !text(value.sourceName) ||
    !text(value.sourceRootPath) ||
    !text(value.path) ||
    !timestamp(value.createdAtMs)
  )
    return invalid();
  const node = parseNodeSummary(value.node);
  const parent = value.parent === null ? null : parseBreadcrumb(value.parent);
  if (node.parentId !== (parent?.id ?? null)) return invalid();
  return {
    sourceId: value.sourceId,
    scanId: value.scanId,
    indexedAt: value.indexedAt,
    sourceName: value.sourceName,
    sourceRootPath: value.sourceRootPath,
    node,
    path: value.path,
    createdAtMs: value.createdAtMs,
    parent,
  };
}
export function parseNodePage(value: unknown): NodePage {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 100 ||
    !Array.isArray(value.breadcrumbs) ||
    value.breadcrumbs.length < 1 ||
    value.breadcrumbs.length > 32 ||
    !optionalText(value.nextCursor)
  )
    return invalid();
  const folder = parseNodeDetail(value.folder);
  const items = value.items.map(parseNodeSummary);
  const breadcrumbs = value.breadcrumbs.map(parseBreadcrumb);
  if (
    folder.node.kind !== 'folder' ||
    breadcrumbs.at(-1)?.id !== folder.node.id ||
    new Set(breadcrumbs.map((item) => item.id)).size !== breadcrumbs.length ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item) => item.parentId !== folder.node.id || item.id === folder.node.id,
    ) ||
    (value.nextCursor !== null && value.nextCursor !== items.at(-1)?.id)
  )
    return invalid();
  return { folder, items, breadcrumbs, nextCursor: value.nextCursor };
}

function context(detail: NodeDetail, sourceId: string, scanId: string) {
  if (detail.sourceId !== sourceId || detail.scanId !== scanId) invalid();
}
function desktop() {
  if (!isTauri()) throw new DesktopRequiredError();
}
export async function getNodeChildren(
  sourceId: string,
  scanId: string,
  folderId: string | null,
  cursor: string | null = null,
): Promise<NodePage> {
  desktop();
  const page = parseNodePage(
    await invoke<unknown>('get_node_children', {
      sourceId,
      scanId,
      folderId,
      cursor,
      limit: CATALOG_PAGE_SIZE,
    }),
  );
  context(page.folder, sourceId, scanId);
  if (folderId !== null && page.folder.node.id !== folderId) invalid();
  if (folderId === null && page.folder.node.parentId !== null) invalid();
  return page;
}
export async function getNodeDetail(
  sourceId: string,
  scanId: string,
  nodeId: string,
): Promise<NodeDetail> {
  desktop();
  const detail = parseNodeDetail(
    await invoke<unknown>('get_node_detail', { sourceId, scanId, nodeId }),
  );
  context(detail, sourceId, scanId);
  if (detail.node.id !== nodeId) invalid();
  return detail;
}
export function catalogErrorMessage(error: unknown): string {
  const code = record(error) ? error.code : null;
  switch (code) {
    case 'INDEX_CHANGED':
      return 'O índice mudou durante a navegação. Atualize o catálogo para consultar a nova versão.';
    case 'SOURCE_NOT_AUTHORIZED':
      return 'A autorização desta fonte foi revogada. Atualize a lista de fontes.';
    case 'INDEX_NOT_FOUND':
      return 'Esta fonte ainda não possui um índice salvo.';
    case 'INDEX_EMPTY':
      return 'A última varredura não produziu uma raiz navegável. Confira o relatório de erros.';
    case 'NODE_NOT_FOUND':
      return 'Este item não faz parte do índice atual. Atualize o catálogo.';
    case 'INVALID_CATALOG':
      return 'A hierarquia do índice está inconsistente. Confira o relatório e indexe a fixture novamente.';
    default:
      return 'Não foi possível consultar o catálogo local. Tente novamente.';
  }
}
