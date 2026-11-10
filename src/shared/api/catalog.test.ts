import { invoke, isTauri } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/catalog-page.json';
import { fileDetail, rootPage } from '../../../tests/catalog-fixtures';
import {
  catalogErrorMessage,
  getNodeChildren,
  getNodeDetail,
  parseNodeDetail,
  parseNodePage,
  parseNodeSummary,
} from './catalog';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
});

describe('T-048 — catálogo Rust/TS e IPC limitado por IDs/snapshot', () => {
  it('valida a fixture compartilhada sem perda de precisão nem troca de pai', () => {
    expect(parseNodePage(fixture)).toEqual(fixture);
    expect(parseNodeDetail(fileDetail)).toEqual(fileDetail);
    expect(BigInt(rootPage.folder.node.sizeBytes!)).toBe(9007199254740993n);
  });
  it.each([
    null,
    {},
    { ...fixture, items: [{ ...fixture.items[0], kind: 'idea' }] },
    {
      ...fixture,
      items: [{ ...fixture.items[0], sizeBytes: 9007199254740992 }],
    },
    {
      ...fixture,
      items: [{ ...fixture.items[0], sizeBytes: '9223372036854775808' }],
    },
    { ...fixture, items: [{ ...fixture.items[0], modifiedAtMs: 'amanha' }] },
    { ...fixture, items: [{ ...fixture.items[0], parentId: 'outra-pasta' }] },
    { ...fixture, items: [fixture.items[0], fixture.items[0]] },
    { ...fixture, breadcrumbs: [] },
    {
      ...fixture,
      breadcrumbs: [...fixture.breadcrumbs, ...fixture.breadcrumbs],
    },
    { ...fixture, nextCursor: 'cursor-inventado' },
    { ...fixture, items: Array(101).fill(fixture.items[0]) },
  ])(
    'recusa página incompatível ou com vínculos inconsistentes: %j',
    (value) => {
      expect(() => parseNodePage(value)).toThrow();
    },
  );
  it('distingue zero, ausência e data anterior a 1970', () => {
    expect(
      parseNodeSummary({
        ...fixture.items[0],
        sizeBytes: '0',
        modifiedAtMs: '-1',
      }).sizeBytes,
    ).toBe('0');
    expect(
      parseNodeSummary({ ...fixture.items[0], sizeBytes: null }).sizeBytes,
    ).toBeNull();
    expect(() => parseNodeDetail({ ...fileDetail, parent: null })).toThrow();
    expect(() =>
      parseNodeDetail({ ...fileDetail, createdAtMs: 'erro-interno' }),
    ).toThrow();
  });
  it('envia apenas IDs, cursor e limite fixo; caminho nunca é argumento', async () => {
    vi.mocked(invoke).mockResolvedValue(fixture);
    expect(
      await getNodeChildren(
        rootPage.folder.sourceId,
        rootPage.folder.scanId,
        null,
      ),
    ).toEqual(rootPage);
    expect(invoke).toHaveBeenLastCalledWith('get_node_children', {
      sourceId: rootPage.folder.sourceId,
      scanId: rootPage.folder.scanId,
      folderId: null,
      cursor: null,
      limit: 50,
    });
    vi.mocked(invoke).mockResolvedValue(fileDetail);
    await getNodeDetail(
      fileDetail.sourceId,
      fileDetail.scanId,
      fileDetail.node.id,
    );
    expect(invoke).toHaveBeenLastCalledWith('get_node_detail', {
      sourceId: fileDetail.sourceId,
      scanId: fileDetail.scanId,
      nodeId: fileDetail.node.id,
    });
  });
  it('rejeita resposta de outra fonte, snapshot, pasta ou item', async () => {
    vi.mocked(invoke).mockResolvedValue(fixture);
    await expect(
      getNodeChildren('outra', rootPage.folder.scanId, null),
    ).rejects.toThrow();
    await expect(
      getNodeChildren(rootPage.folder.sourceId, 'novo-snapshot', null),
    ).rejects.toThrow();
    await expect(
      getNodeChildren(
        rootPage.folder.sourceId,
        rootPage.folder.scanId,
        'outra-pasta',
      ),
    ).rejects.toThrow();
    vi.mocked(invoke).mockResolvedValue(fileDetail);
    await expect(
      getNodeDetail(fileDetail.sourceId, fileDetail.scanId, 'outro-item'),
    ).rejects.toThrow();
  });
  it('navegador sem Tauri não recebe catálogo fictício', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await expect(getNodeChildren('fonte', 'scan', null)).rejects.toThrow(
      'Este recurso requer o aplicativo desktop.',
    );
    await expect(getNodeDetail('fonte', 'scan', 'item')).rejects.toThrow(
      'Este recurso requer o aplicativo desktop.',
    );
    expect(invoke).not.toHaveBeenCalled();
  });
  it('traduz erros sem mostrar caminhos, SQL ou conteúdo privado', () => {
    expect(
      catalogErrorMessage({ code: 'INDEX_CHANGED', message: 'privado' }),
    ).toContain('O índice mudou');
    expect(catalogErrorMessage(new Error('privado'))).not.toContain('privado');
    expect(
      catalogErrorMessage({ code: 'DATABASE_UNAVAILABLE', message: 'privado' }),
    ).not.toContain('privado');
  });
});
