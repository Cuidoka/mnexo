import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/scene-projection.json';
import { parseSceneProjection } from '../../shared/api/scene';
import { layoutScene, type SceneBox } from './scene-layout';

describe('RF-003 / T-052 — volumes de pastas contêm nós reais', () => {
  it('preserva cada ID/pai e contém os filhos em todos os eixos', () => {
    const projection = parseSceneProjection(fixture);
    const seen: string[] = [];
    function inspect(box: SceneBox) {
      seen.push(box.node.id);
      box.size.forEach((extent) =>
        expect(Number.isFinite(extent) && extent > 0).toBe(true),
      );
      for (const child of box.children) {
        expect(child.node.parentId).toBe(box.node.id);
        expect(Math.abs(child.position[0]) + child.size[0] / 2).toBeLessThan(
          box.size[0] / 2,
        );
        expect(Math.abs(child.position[2]) + child.size[2] / 2).toBeLessThan(
          box.size[2] / 2,
        );
        expect(child.position[1]).toBeGreaterThan(0);
        expect(child.position[1] + child.size[1]).toBeLessThan(box.size[1]);
        inspect(child);
      }
    }
    inspect(layoutScene(projection));
    expect(new Set(seen)).toEqual(
      new Set([
        projection.root.node.id,
        ...projection.nodes.map((node) => node.id),
      ]),
    );
    expect(seen).toHaveLength(12);
    expect(layoutScene(projection)).toEqual(layoutScene(projection));
    expect(projection).toEqual(fixture);
  });
  it('mostra pasta vazia e arquivos zero/null/grandes sem gerar novos IDs', () => {
    const projection = parseSceneProjection({
      ...fixture,
      nodes: [
        fixture.nodes[0],
        ...['0', null, '9223372036854775807'].map((sizeBytes, index) => ({
          ...fixture.nodes[1],
          id: `file-${index}`,
          sizeBytes,
        })),
      ],
    });
    const layout = layoutScene(projection);
    expect(layout.children[0].children).toEqual([]);
    expect(layout.children[1].size[0]).toBeGreaterThan(0);
    expect(layout.children[2].size[0]).toBeGreaterThan(0);
    expect(layout.children[3].size[0]).toBeGreaterThan(
      layout.children[1].size[0],
    );
    expect(layoutScene({ ...projection, nodes: [] }).children).toEqual([]);
  });
});
