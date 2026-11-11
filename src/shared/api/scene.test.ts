import { invoke, isTauri } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scene-projection.json';
import { getSceneProjection, parseSceneProjection } from './scene';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
});

describe('T-051 — contrato limitado da cena e contexto IPC', () => {
  it('preserva IDs, pais e bytes exatos da fixture Rust/TS', () => {
    expect(parseSceneProjection(fixture)).toEqual(fixture);
    expect(parseSceneProjection(fixture).root.node.sizeBytes).toBe(
      '9007199254740993',
    );
  });
  it.each([
    null,
    {},
    { ...fixture, nodeLimit: 101 },
    { ...fixture, depthLimit: 4 },
    { ...fixture, truncated: 'false' },
    { ...fixture, nodes: Array(100).fill(fixture.nodes[0]) },
    { ...fixture, nodes: [fixture.nodes[0], fixture.nodes[0]] },
    { ...fixture, nodes: [{ ...fixture.nodes[0], parentId: 'outra-fonte' }] },
    {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], parentId: fixture.nodes[0].id }],
    },
    {
      ...fixture,
      nodes: [
        fixture.nodes[1],
        { ...fixture.nodes[2], parentId: fixture.nodes[1].id },
      ],
    },
    { ...fixture, nodes: [...fixture.nodes].reverse() },
    {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], sizeBytes: 9007199254740992 }],
    },
    {
      ...fixture,
      root: { ...fixture.root, node: { ...fixture.root.node, kind: 'file' } },
    },
  ])('recusa projeção incompatível ou árvore inválida: %j', (value) => {
    expect(() => parseSceneProjection(value)).toThrow();
  });
  it('recusa profundidade excessiva mesmo com pais válidos', () => {
    const nodes = Array.from({ length: 4 }, (_, index) => ({
      ...fixture.nodes[0],
      id: `pasta-${index}`,
      parentId: index === 0 ? fixture.root.node.id : `pasta-${index - 1}`,
    }));
    expect(() => parseSceneProjection({ ...fixture, nodes })).toThrow();
  });
  it('chama somente o comando por IDs e valida o snapshot recebido', async () => {
    vi.mocked(invoke).mockResolvedValue(fixture);
    await getSceneProjection(fixture.root.sourceId, fixture.root.scanId);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_scene_projection', {
      sourceId: fixture.root.sourceId,
      scanId: fixture.root.scanId,
    });
    await expect(
      getSceneProjection('outra', fixture.root.scanId),
    ).rejects.toThrow();
    await expect(
      getSceneProjection(fixture.root.sourceId, 'antigo'),
    ).rejects.toThrow();
  });
  it('não oferece dados fictícios nem IPC fora do desktop', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await expect(getSceneProjection('a', 'b')).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
