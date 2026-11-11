import { lazy, Suspense, useEffect, useState } from 'react';
import { catalogErrorMessage } from '../../shared/api/catalog';
import {
  getSceneProjection,
  type SceneProjection,
} from '../../shared/api/scene';
import { formatBytes } from '../catalog/metadata-format';
const SceneCanvas = lazy(() =>
  import('./SceneCanvas').then((module) => ({ default: module.SceneCanvas })),
);

export function ScenePanel({
  sourceId,
  scanId,
  sourceName,
  onClose,
  onRefresh,
  onOpen2D,
}: {
  sourceId: string;
  scanId: string;
  sourceName: string;
  onClose: () => void;
  onRefresh: () => void;
  onOpen2D: () => void;
}) {
  const [projection, setProjection] = useState<SceneProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getSceneProjection(sourceId, scanId).then(
      (result) => {
        if (active) setProjection(result);
      },
      (failure) => {
        if (active) setError(catalogErrorMessage(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [sourceId, scanId]);
  const nodes = projection ? [projection.root.node, ...projection.nodes] : [];
  const names = new Map(nodes.map((node) => [node.id, node.title]));
  return (
    <section
      className="catalog-browser scene-panel"
      aria-labelledby="scene-title"
    >
      <div className="catalog-header">
        <div>
          <h2 id="scene-title">Cena 3D — {sourceName}</h2>
          <p>Metadados do índice salvo. O estado no disco pode ter mudado.</p>
        </div>
        <div className="catalog-actions">
          <button className="text-button" type="button" onClick={onRefresh}>
            Atualizar catálogo
          </button>
          <button className="secondary-button" type="button" onClick={onOpen2D}>
            Ver índice 2D
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar cena
          </button>
        </div>
      </div>
      {!projection && !error && <p role="status">Consultando nós do índice…</p>}
      {error && (
        <p className="source-error" role="alert">
          {error}
        </p>
      )}
      {projection && (
        <>
          <p>
            {nodes.length} nós reais, incluindo a raiz. Índice de{' '}
            {new Date(projection.root.indexedAt).toLocaleString('pt-BR')}.
          </p>
          {projection.truncated && (
            <p className="catalog-warning" role="status">
              Exibição limitada a 100 nós e 3 níveis abaixo da raiz. Há itens do
              índice fora desta cena; consulte o índice 2D.
            </p>
          )}
          {projection.root.node.sizePartial && (
            <p className="catalog-warning">
              Índice parcial: consulte o relatório de erros da fonte.
            </p>
          )}
          <Suspense fallback={<p role="status">Carregando renderizador 3D…</p>}>
            <SceneCanvas
              key={`${sourceId}:${scanId}`}
              projection={projection}
            />
          </Suspense>
          <p className="scene-legend">
            <span>Verde: pastas e seus limites.</span>{' '}
            <span>Azul: arquivos.</span> <span>Âmbar: metadados parciais.</span>
          </p>
          <p>
            Volumes organizados por parentesco; tamanho dos arquivos em escala
            comprimida. Câmera fixa nesta versão.
          </p>
          <details>
            <summary>Relação dos {nodes.length} nós exibidos</summary>
            <div className="catalog-table-scroll">
              <table className="catalog-table">
                <caption>Identidade e metadados dos objetos da cena</caption>
                <thead>
                  <tr>
                    <th>Nome / ID</th>
                    <th>Tipo</th>
                    <th>Pasta pai</th>
                    <th>Tamanho indexado</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.id}>
                      <td>
                        {node.title}
                        <br />
                        <small>{node.id}</small>
                      </td>
                      <td>{node.kind === 'folder' ? 'Pasta' : 'Arquivo'}</td>
                      <td>
                        {node.parentId === null
                          ? 'Raiz da fonte'
                          : names.get(node.parentId)}
                      </td>
                      <td>
                        {formatBytes(node.sizeBytes)}
                        {node.sizePartial ? ' (parcial)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
